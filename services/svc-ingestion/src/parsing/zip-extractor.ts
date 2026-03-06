import { unzipSync } from "fflate";
import { createLogger } from "@ai-foundry/utils";
import type { UnstructuredElement } from "./unstructured.js";
import { parseJavaController } from "./java-controller.js";
import { parseJavaDataModel } from "./java-datamodel.js";
import { parseJavaService } from "./java-service.js";
import { parseDdl } from "./ddl.js";
import { classifyJavaFile } from "./code-classifier.js";
import { isMyBatisMapper, parseMyBatisMapper } from "./mybatis-mapper.js";

const logger = createLogger("svc-ingestion:zip-extractor");

const MAX_FILES = 5000;
const MAX_FILE_SIZE = 500 * 1024; // 500KB per file

// Paths to skip during extraction
const SKIP_PATTERNS = [
  /\/target\//,
  /\/build\//,
  /\/.gradle\//,
  /\/.mvn\//,
  /\/.svn\//,
  /\/.git\//,
  /\/node_modules\//,
  /\.class$/,
  /\.jar$/,
  /\.war$/,
  /Test\.java$/,
  /Tests\.java$/,
  /IT\.java$/,
  /\.png$/i,
  /\.jpg$/i,
  /\.gif$/i,
  /\.ico$/i,
  /\.svg$/i,
  /\.woff2?$/i,
  /\.ttf$/i,
  /\.eot$/i,
];

export interface ExtractedFile {
  path: string;
  filename: string;
  content: string;
  type: "java" | "sql" | "xml" | "properties";
}

export function extractSourceFiles(zipBytes: ArrayBuffer): ExtractedFile[] {
  const files: ExtractedFile[] = [];
  const uint8 = new Uint8Array(zipBytes);
  const unzipped = unzipSync(uint8);

  for (const [path, data] of Object.entries(unzipped)) {
    if (files.length >= MAX_FILES) {
      logger.warn("Max file limit reached", { limit: MAX_FILES });
      break;
    }

    // Skip directories (empty data)
    if (data.length === 0) continue;

    // Skip binary/unwanted files
    if (SKIP_PATTERNS.some((p) => p.test(path))) continue;

    // Determine file type
    const ext = getExtension(path);
    if (!ext) continue;

    // Skip oversized files
    if (data.length > MAX_FILE_SIZE) {
      logger.warn("Skipping oversized file", { path, size: data.length });
      continue;
    }

    const content = new TextDecoder("utf-8").decode(data);
    const filename = path.split("/").pop() ?? path;

    files.push({ path, filename, content, type: ext });
  }

  logger.info("Extracted source files from zip", {
    total: Object.keys(unzipped).length,
    extracted: files.length,
    java: files.filter((f) => f.type === "java").length,
    sql: files.filter((f) => f.type === "sql").length,
  });

  return files;
}

function getExtension(path: string): ExtractedFile["type"] | null {
  if (path.endsWith(".java")) return "java";
  if (path.endsWith(".sql")) return "sql";
  if (path.endsWith(".xml")) return "xml";
  if (path.endsWith(".properties")) return "properties";
  return null;
}

export function parseSourceProject(
  files: ExtractedFile[],
  projectName: string,
): UnstructuredElement[] {
  const elements: UnstructuredElement[] = [];

  for (const file of files) {
    if (file.type === "java") {
      const javaElements = parseJavaFile(file);
      elements.push(...javaElements);
    } else if (file.type === "sql") {
      const ddlTables = parseDdl(file.content, file.filename);
      for (const table of ddlTables) {
        elements.push({
          type: "CodeDdl",
          text: JSON.stringify(table),
        });
      }
    } else if (file.type === "xml") {
      if (isMyBatisMapper(file.content)) {
        const mapper = parseMyBatisMapper(file.content, file.filename);
        if (mapper) {
          elements.push({
            type: "CodeMapper",
            text: JSON.stringify(mapper),
          });
        }
      }
    }
  }

  // Add project summary element
  const javaFiles = files.filter((f) => f.type === "java");
  const sqlFiles = files.filter((f) => f.type === "sql");
  const controllerCount = elements.filter((e) => e.type === "CodeController").length;
  const dataModelCount = elements.filter((e) => e.type === "CodeDataModel").length;
  const transactionCount = elements.filter((e) => e.type === "CodeTransaction").length;
  const ddlCount = elements.filter((e) => e.type === "CodeDdl").length;
  const mapperCount = elements.filter((e) => e.type === "CodeMapper").length;

  elements.push({
    type: "SourceProjectSummary",
    text: JSON.stringify({
      projectName,
      stats: {
        totalFiles: files.length,
        javaFiles: javaFiles.length,
        sqlFiles: sqlFiles.length,
        controllerCount,
        endpointCount: elements
          .filter((e) => e.type === "CodeController")
          .reduce((sum, e) => {
            const parsed = JSON.parse(e.text) as { endpoints?: unknown[] };
            return sum + (parsed.endpoints?.length ?? 0);
          }, 0),
        dataModelCount,
        transactionCount,
        ddlTableCount: ddlCount,
        mapperCount,
      },
    }),
  });

  logger.info("Parsed source project", {
    projectName,
    totalElements: elements.length,
    controllerCount,
    dataModelCount,
    transactionCount,
    ddlCount,
    mapperCount,
  });

  return elements;
}

function parseJavaFile(file: ExtractedFile): UnstructuredElement[] {
  const elements: UnstructuredElement[] = [];
  const category = classifyJavaFile(file.filename, file.content);

  switch (category) {
    case "source_controller": {
      const controller = parseJavaController(file.content, file.filename);
      if (controller) {
        elements.push({
          type: "CodeController",
          text: JSON.stringify(controller),
        });
      }
      break;
    }
    case "source_vo": {
      const dataModel = parseJavaDataModel(file.content, file.filename);
      if (dataModel) {
        elements.push({
          type: "CodeDataModel",
          text: JSON.stringify(dataModel),
        });
      }
      break;
    }
    case "source_service": {
      const transactions = parseJavaService(file.content, file.filename);
      for (const tx of transactions) {
        elements.push({
          type: "CodeTransaction",
          text: JSON.stringify(tx),
        });
      }
      break;
    }
    default:
      // source_config — skip for now
      break;
  }

  return elements;
}

/**
 * Parse a single Java file (not in a zip). Used for individual .java uploads.
 */
export function parseSingleJavaFile(source: string, filename: string): UnstructuredElement[] {
  return parseJavaFile({ path: filename, filename, content: source, type: "java" });
}

/**
 * Parse a single SQL file. Used for individual .sql uploads.
 */
export function parseSingleSqlFile(source: string, filename: string): UnstructuredElement[] {
  const ddlTables = parseDdl(source, filename);
  return ddlTables.map((table) => ({
    type: "CodeDdl",
    text: JSON.stringify(table),
  }));
}
