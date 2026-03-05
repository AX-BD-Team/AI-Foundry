import type { CodeDataModel, CodeField } from "@ai-foundry/types";

const RE_PACKAGE = /^package\s+([\w.]+)\s*;/m;
const RE_CLASS_NAME = /(?:public\s+)?class\s+(\w+)/;

const RE_HAS_LOMBOK = /@(Data|Getter|Setter|Value)\b/;

// Field: private String accountNo; or private Long balance = 0L;
const RE_FIELD = /(?:private|protected|public)\s+([\S]+(?:<[^;]*?>)?)\s+(\w+)\s*[;=]/g;

// JPA annotations
const RE_JPA_TABLE = /@Table\s*\(\s*name\s*=\s*["'](\w+)["']/;
const RE_JPA_COLUMN = /@Column\s*\(([^)]*)\)/;
const RE_JPA_ID = /@Id\b/;
const RE_ENTITY = /@Entity\b/;

const SUFFIX_MAP: Array<{ pattern: RegExp; type: CodeDataModel["modelType"] }> = [
  { pattern: /VO\.java$/i, type: "vo" },
  { pattern: /Dto\.java$/i, type: "dto" },
  { pattern: /DTO\.java$/i, type: "dto" },
  { pattern: /Req\.java$/i, type: "request" },
  { pattern: /Request\.java$/i, type: "request" },
  { pattern: /Res\.java$/i, type: "response" },
  { pattern: /Response\.java$/i, type: "response" },
];

export function isDataModel(filename: string, content: string): boolean {
  if (RE_ENTITY.test(content)) return true;
  if (RE_HAS_LOMBOK.test(content)) {
    RE_FIELD.lastIndex = 0;
    if (RE_FIELD.test(content)) return true;
  }
  for (const { pattern } of SUFFIX_MAP) {
    if (pattern.test(filename)) return true;
  }
  return false;
}

function classifyModelType(filename: string, content: string): CodeDataModel["modelType"] {
  for (const { pattern, type } of SUFFIX_MAP) {
    if (pattern.test(filename)) return type;
  }
  if (RE_ENTITY.test(content)) return "entity";
  return "vo";
}

export function parseJavaDataModel(source: string, filename: string): CodeDataModel | null {
  if (!isDataModel(filename, source)) return null;

  const packageMatch = RE_PACKAGE.exec(source);
  const classMatch = RE_CLASS_NAME.exec(source);
  const tableMatch = RE_JPA_TABLE.exec(source);

  const className = classMatch?.[1] ?? filename.replace(".java", "");
  const packageName = packageMatch?.[1] ?? "";
  const modelType = classifyModelType(filename, source);

  const fields = extractFields(source);

  if (fields.length === 0) return null;

  return {
    className,
    packageName,
    modelType,
    fields,
    tableName: tableMatch?.[1],
    sourceFile: filename,
  };
}

function extractFields(source: string): CodeField[] {
  const fields: CodeField[] = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (/\bstatic\b/.test(trimmed) && /\bfinal\b/.test(trimmed)) continue;
    if (trimmed.includes("serialVersionUID")) continue;

    RE_FIELD.lastIndex = 0;
    const fieldMatch = RE_FIELD.exec(trimmed);
    if (!fieldMatch) continue;

    const type = fieldMatch[1] ?? "Object";
    const name = fieldMatch[2] ?? "unknown";

    let annotation: string | undefined;
    let nullable = true;

    const prevLines = collectPrecedingAnnotations(lines, i);

    if (RE_JPA_ID.test(prevLines)) {
      annotation = "@Id";
      nullable = false;
    }

    const colMatch = RE_JPA_COLUMN.exec(prevLines);
    if (colMatch) {
      const colContent = colMatch[1] ?? "";
      annotation = annotation ? `${annotation} @Column` : "@Column";
      if (/nullable\s*=\s*false/.test(colContent)) {
        nullable = false;
      }
    }

    const commentLine = lines[i - 1]?.trim() ?? "";
    let comment: string | undefined;
    if (commentLine.startsWith("//")) {
      comment = commentLine.slice(2).trim();
    } else if (commentLine.startsWith("*") && !commentLine.startsWith("*/")) {
      comment = commentLine.slice(1).trim();
    }

    fields.push({ name, type, nullable, annotation, comment });
  }

  return fields;
}

function collectPrecedingAnnotations(lines: string[], index: number): string {
  const result: string[] = [];
  for (let i = index - 1; i >= 0 && i >= index - 5; i--) {
    const line = lines[i]?.trim() ?? "";
    if (line.startsWith("@")) {
      result.push(line);
    } else if (line.length > 0 && !line.startsWith("//") && !line.startsWith("*")) {
      break;
    }
  }
  return result.join("\n");
}
