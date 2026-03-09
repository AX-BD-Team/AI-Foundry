/**
 * AST Parser — regex-based Java/Spring source code parser.
 *
 * Extracts API metadata directly from Java source without LLM,
 * supplementing the LLM-extracted CodeController data.
 *
 * Stage 2 of AIF-PLAN-017 FactCheck Coverage Improvement Roadmap.
 */

import type { CodeController, CodeEndpoint, CodeParam, HttpMethod } from "@ai-foundry/types";

// ── Main entry points ───────────────────────────────────────────

/**
 * Parse a Java controller source file and extract Spring REST endpoints.
 * Returns a CodeController-compatible object, or null if not a controller.
 */
export function parseSpringController(source: string, sourceFile: string): CodeController | null {
  // 1. Check if this is a controller class
  if (!isControllerClass(source)) return null;

  // 2. Extract class-level metadata
  const className = extractClassName(source);
  const packageName = extractPackageName(source);
  const basePath = extractClassRequestMapping(source);
  const swaggerTag = extractSwaggerTag(source);

  if (!className) return null;

  // 3. Extract all endpoint methods
  const endpoints = extractEndpoints(source);

  const result: CodeController = {
    className,
    packageName: packageName ?? "",
    basePath: basePath ?? "",
    endpoints,
    sourceFile,
  };
  if (swaggerTag !== undefined) result.swaggerTag = swaggerTag;
  return result;
}

/**
 * Parse a Java service class and extract @Transactional method metadata.
 * Returns an array of service method info for Controller→Service call chain analysis.
 */
export function parseServiceClass(source: string, sourceFile: string): ServiceMethodInfo[] {
  if (!isServiceClass(source)) return [];

  const className = extractClassName(source) ?? "";
  const methods: ServiceMethodInfo[] = [];

  // Match method declarations with optional @Transactional
  const methodRegex = /(?:@Transactional(?:\s*\([^)]*\))?\s+)?(?:public|protected)\s+(\S+)\s+(\w+)\s*\(([^)]*)\)/g;
  let match;

  while ((match = methodRegex.exec(source)) !== null) {
    const returnType = match[1] ?? "void";
    const methodName = match[2] ?? "";
    const paramStr = match[3] ?? "";

    // Check if @Transactional is in the matched region or immediately before
    const fullMatch = match[0] ?? "";
    const isTransactional = fullMatch.includes("@Transactional");

    // Extract injected dependencies to trace Controller→Service→Mapper chain
    const calledMappers = extractMapperCalls(source, methodName);

    methods.push({
      className,
      methodName,
      returnType,
      parameters: parseMethodParams(paramStr),
      isTransactional,
      calledMappers,
      sourceFile,
    });
  }

  return methods;
}

// ── Types ────────────────────────────────────────────────────────

export interface ServiceMethodInfo {
  className: string;
  methodName: string;
  returnType: string;
  parameters: CodeParam[];
  isTransactional: boolean;
  /** Mapper method names called within this service method */
  calledMappers: string[];
  sourceFile: string;
}

// ── Class-level detection ────────────────────────────────────────

/** Check if source contains @RestController or @Controller annotation */
export function isControllerClass(source: string): boolean {
  return /@(?:Rest)?Controller\b/.test(source);
}

/** Check if source contains @Service annotation */
export function isServiceClass(source: string): boolean {
  return /@Service\b/.test(source);
}

/** Extract the class name from a Java source file */
export function extractClassName(source: string): string | null {
  const match = source.match(/(?:public\s+)?class\s+(\w+)/);
  return match?.[1] ?? null;
}

/** Extract the package name */
export function extractPackageName(source: string): string | null {
  const match = source.match(/^package\s+([\w.]+)\s*;/m);
  return match?.[1] ?? null;
}

// ── Request Mapping Extraction ──────────────────────────────────

/**
 * Extract class-level @RequestMapping base path.
 * Handles:
 * - @RequestMapping("/path")
 * - @RequestMapping(value = "/path")
 * - @RequestMapping({"/path1", "/path2"}) — takes first
 */
export function extractClassRequestMapping(source: string): string {
  // Find @RequestMapping before class declaration
  const classIdx = source.search(/(?:public\s+)?class\s+\w+/);
  if (classIdx < 0) return "";

  const beforeClass = source.slice(0, classIdx);
  return extractMappingPath(beforeClass) ?? "";
}

/** Extract Swagger @Api tag */
function extractSwaggerTag(source: string): string | undefined {
  const match = source.match(/@Api\s*\(\s*(?:tags?\s*=\s*)?["']([^"']+)["']/);
  return match?.[1];
}

// ── Endpoint Extraction ─────────────────────────────────────────

/**
 * Extract all endpoint methods from a controller source.
 * Supports: @GetMapping, @PostMapping, @PutMapping, @DeleteMapping,
 *           @PatchMapping, @RequestMapping with method attribute.
 */
export function extractEndpoints(source: string): CodeEndpoint[] {
  const endpoints: CodeEndpoint[] = [];

  // Step 1: Find all @XxxMapping positions with their annotation args
  const mappingAnnotationPattern =
    /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*(?:\(([^)]*)\))?/g;

  let match;
  while ((match = mappingAnnotationPattern.exec(source)) !== null) {
    const annotationType = match[1] ?? "";
    const annotationArgs = match[2] ?? "";

    // Find the method signature after the annotation
    const afterAnnotation = source.slice((match.index ?? 0) + match[0].length);
    const methodSigMatch = afterAnnotation.match(
      /\s*(?:public|protected|private)?\s*(?:[\w<>,\s\[\]]+?)\s+(\w+)\s*\(/,
    );
    if (!methodSigMatch) continue;

    const methodName = methodSigMatch[1] ?? "";

    // Skip class-level @RequestMapping (followed by "class Xxx")
    const betweenAnnotationAndMethod = afterAnnotation.slice(0, methodSigMatch.index ?? 0);
    if (/\bclass\s+/.test(betweenAnnotationAndMethod)) continue;

    // Extract parameters by finding balanced parentheses
    const methodSigEnd = (match.index ?? 0) + match[0].length + (methodSigMatch.index ?? 0) + methodSigMatch[0].length;
    const paramStr = extractBalancedParens(source, methodSigEnd - 1);

    const httpMethods = resolveHttpMethods(annotationType, annotationArgs);
    const path = extractMappingPath(annotationArgs) ?? "";
    const parameters = extractMethodParameters(paramStr);
    const returnType = extractReturnType(source, match.index ?? 0);

    // Extract swagger summary — find region between previous method end and current annotation
    const matchIdx = match.index ?? 0;
    const regionStart = Math.max(0, matchIdx - 300);
    let beforeMapping = source.slice(regionStart, matchIdx);
    // Trim to the last closing brace to avoid bleeding into previous method annotations
    const lastBrace = beforeMapping.lastIndexOf("}");
    if (lastBrace >= 0) {
      beforeMapping = beforeMapping.slice(lastBrace + 1);
    }
    const swaggerSummary = extractSwaggerSummary(beforeMapping);

    // Extract line number
    const lineNumber = countLines(source, match.index ?? 0);

    const ep: CodeEndpoint = {
      httpMethod: httpMethods,
      path,
      methodName,
      parameters,
      returnType,
    };
    if (swaggerSummary !== undefined) ep.swaggerSummary = swaggerSummary;
    if (lineNumber > 0) ep.lineNumber = lineNumber;

    endpoints.push(ep);
  }

  return endpoints;
}

// ── Helper: HTTP Method Resolution ──────────────────────────────

const VALID_HTTP_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

const SHORTCUT_METHOD_MAP: Record<string, HttpMethod> = {
  GetMapping: "GET",
  PostMapping: "POST",
  PutMapping: "PUT",
  DeleteMapping: "DELETE",
  PatchMapping: "PATCH",
};

/**
 * Resolve HTTP methods from annotation type + args.
 * @GetMapping → ["GET"]
 * @RequestMapping(method = RequestMethod.POST) → ["POST"]
 * @RequestMapping → ["GET"] (default)
 */
function resolveHttpMethods(annotationType: string, args: string): HttpMethod[] {
  // Shortcut annotations (@GetMapping etc.)
  const shortcut = SHORTCUT_METHOD_MAP[annotationType];
  if (shortcut) return [shortcut];

  // @RequestMapping — check method attribute
  const methodMatch = args.match(/method\s*=\s*\{?\s*((?:RequestMethod\.\w+(?:\s*,\s*)?)+)\s*\}?/);
  if (methodMatch?.[1]) {
    return methodMatch[1]
      .split(",")
      .map((m) => m.trim().replace("RequestMethod.", ""))
      .filter((m): m is HttpMethod => VALID_HTTP_METHODS.has(m));
  }

  // Default: GET
  return ["GET"];
}

// ── Helper: Path Extraction ─────────────────────────────────────

/**
 * Extract path from a mapping annotation's arguments.
 * Handles: "/path", value="/path", value={"/path1","/path2"} (takes first),
 *          path="/path"
 */
function extractMappingPath(args: string): string | null {
  if (!args.trim()) return null;

  // Pattern 1: value = "/path" or path = "/path"
  const valueMatch = args.match(/(?:value|path)\s*=\s*["']([^"']+)["']/);
  if (valueMatch?.[1]) return valueMatch[1];

  // Pattern 2: value = {"/path1", "/path2"} — take first
  const arrayMatch = args.match(/(?:value|path)\s*=\s*\{\s*["']([^"']+)["']/);
  if (arrayMatch?.[1]) return arrayMatch[1];

  // Pattern 3: Just "/path" (positional arg)
  const directMatch = args.match(/["']([^"']+)["']/);
  if (directMatch?.[1]) return directMatch[1];

  return null;
}

// ── Helper: Parameter Extraction ────────────────────────────────

/**
 * Extract method parameters with their Spring annotations.
 * Handles: @RequestParam, @PathVariable, @RequestBody, @RequestHeader
 */
function extractMethodParameters(paramStr: string): CodeParam[] {
  if (!paramStr.trim()) return [];

  const params: CodeParam[] = [];
  // Split by comma, but handle generics (e.g., Map<String, String>)
  const paramParts = splitParams(paramStr);

  for (const part of paramParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Extract annotation
    const annotation = extractParamAnnotation(trimmed);

    // Extract type and name (last two tokens after removing annotations)
    const withoutAnnotation = trimmed
      .replace(/@\w+(?:\s*\([^)]*\))?/g, "")
      .trim();
    const tokens = withoutAnnotation.split(/\s+/);
    const name = tokens[tokens.length - 1] ?? "";
    const type = tokens.slice(0, -1).join(" ") || "Object";

    // Determine required: @RequestParam without required=false defaults to true
    const required = annotation !== "RequestBody" && !trimmed.includes("required=false")
      && !trimmed.includes("required = false");

    const param: CodeParam = { name, type, required };
    if (annotation) param.annotation = `@${annotation}`;
    params.push(param);
  }

  return params;
}

/** Extract the Spring annotation name from a parameter declaration */
function extractParamAnnotation(param: string): string | null {
  const match = param.match(/@(RequestParam|PathVariable|RequestBody|RequestHeader|ModelAttribute)\b/);
  return match?.[1] ?? null;
}

/** Split parameter string by commas, respecting generics depth */
function splitParams(paramStr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of paramStr) {
    if (ch === "<") depth++;
    else if (ch === ">") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);

  return parts;
}

/**
 * Extract balanced parentheses content starting from position of opening '('.
 * Handles nested parens like @RequestParam(required=false).
 */
function extractBalancedParens(source: string, openIdx: number): string {
  if (source[openIdx] !== "(") return "";

  let depth = 0;
  let start = openIdx + 1;
  for (let i = openIdx; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") {
      depth--;
      if (depth === 0) {
        return source.slice(start, i);
      }
    }
  }
  return source.slice(start);
}

// ── Helper: Return Type ─────────────────────────────────────────

/** Extract the return type from the method signature preceding the matched position */
function extractReturnType(source: string, matchIdx: number): string {
  // Look at the method signature area — find "public ReturnType methodName("
  const region = source.slice(Math.max(0, matchIdx - 100), matchIdx + 200);
  const methodMatch = region.match(/(?:public|protected|private)\s+([\w<>,\s\[\]?]+?)\s+\w+\s*\(/);
  return methodMatch?.[1]?.trim() ?? "void";
}

/** Extract the nearest swagger @ApiOperation summary before the annotation */
function extractSwaggerSummary(beforeMethod: string): string | undefined {
  // Find ALL @ApiOperation in the region, take the last (nearest) one
  const matches = [...beforeMethod.matchAll(/@ApiOperation\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/g)];
  const last = matches[matches.length - 1];
  return last?.[1];
}

/** Count newlines before a position to determine line number */
function countLines(source: string, position: number): number {
  let count = 1;
  for (let i = 0; i < position && i < source.length; i++) {
    if (source[i] === "\n") count++;
  }
  return count;
}

// ── Helper: Service→Mapper Call Chain ────────────────────────────

function parseMethodParams(paramStr: string): CodeParam[] {
  if (!paramStr.trim()) return [];
  return splitParams(paramStr).map((p) => {
    const tokens = p.trim().split(/\s+/);
    const name = tokens[tokens.length - 1] ?? "";
    const type = tokens.slice(0, -1).join(" ") || "Object";
    return { name, type, required: true };
  });
}

/**
 * Extract mapper method calls within a service method body.
 * Looks for patterns like: mapperName.methodName(...)
 */
function extractMapperCalls(source: string, methodName: string): string[] {
  // Find the method body
  const methodStart = source.indexOf(methodName + "(");
  if (methodStart < 0) return [];

  // Find opening brace after method signature
  const braceStart = source.indexOf("{", methodStart);
  if (braceStart < 0) return [];

  // Find matching closing brace (simple brace counting)
  let depth = 0;
  let braceEnd = braceStart;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        braceEnd = i;
        break;
      }
    }
  }

  const methodBody = source.slice(braceStart, braceEnd);

  // Find mapper calls: xxxMapper.yyy( or xxxDao.yyy(
  const calls: string[] = [];
  const callPattern = /(\w+(?:Mapper|Dao|Repository))\s*\.\s*(\w+)\s*\(/g;
  let match;
  while ((match = callPattern.exec(methodBody)) !== null) {
    calls.push(`${match[1]}.${match[2]}`);
  }

  return [...new Set(calls)];
}
