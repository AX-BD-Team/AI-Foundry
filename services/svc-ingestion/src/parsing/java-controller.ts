import type { CodeController, CodeEndpoint, CodeParam, HttpMethod } from "@ai-foundry/types";

// === Class-level annotation patterns ===
const RE_REST_CONTROLLER = /@RestController\b/;
const RE_CONTROLLER = /@Controller\b/;
const RE_REQUEST_MAPPING_CLASS = /@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/;
const RE_API_TAG = /@Api\s*\(\s*tags\s*=\s*["']([^"']+)["']/;
const RE_PACKAGE = /^package\s+([\w.]+)\s*;/m;
const RE_CLASS_NAME = /(?:public\s+)?class\s+(\w+)/;

// === Method-level annotation patterns ===
const RE_GET_MAPPING = /@GetMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*?)["']\s*\)/;
const RE_POST_MAPPING = /@PostMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*?)["']\s*\)/;
const RE_PUT_MAPPING = /@PutMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*?)["']\s*\)/;
const RE_DELETE_MAPPING = /@DeleteMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*?)["']\s*\)/;
const RE_PATCH_MAPPING = /@PatchMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*?)["']\s*\)/;

// @RequestMapping with method= attribute
const RE_REQUEST_MAPPING_METHOD = /@RequestMapping\s*\(([^)]+)\)/;
const RE_RM_VALUE = /value\s*=\s*["']([^"']+)["']/;
const RE_RM_METHODS = /method\s*=\s*\{?\s*((?:RequestMethod\.\w+\s*,?\s*)+)\}?/;

const RE_API_OPERATION = /@ApiOperation\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/;

// Method signature: public ReturnType methodName(
const RE_METHOD_START = /(?:public|protected)\s+([\S]+(?:<[^{]*?>)?)\s+(\w+)\s*\(/g;

const HTTP_METHOD_MAP: Record<string, HttpMethod> = {
  "requestmethod.get": "GET",
  "requestmethod.post": "POST",
  "requestmethod.put": "PUT",
  "requestmethod.delete": "DELETE",
  "requestmethod.patch": "PATCH",
  "requestmethod.head": "HEAD",
  "requestmethod.options": "OPTIONS",
};

export function isController(content: string): boolean {
  return RE_REST_CONTROLLER.test(content) || RE_CONTROLLER.test(content);
}

export function parseJavaController(source: string, filename: string): CodeController | null {
  if (!isController(source)) return null;

  const packageMatch = RE_PACKAGE.exec(source);
  const classMatch = RE_CLASS_NAME.exec(source);
  const basePathMatch = RE_REQUEST_MAPPING_CLASS.exec(source);
  const tagMatch = RE_API_TAG.exec(source);

  const className = classMatch?.[1] ?? filename.replace(".java", "");
  const packageName = packageMatch?.[1] ?? "";
  const basePath = basePathMatch?.[1] ?? "";

  const endpoints = extractEndpoints(source, basePath);

  return {
    className,
    packageName,
    basePath,
    swaggerTag: tagMatch?.[1],
    endpoints,
    sourceFile: filename,
  };
}

function extractEndpoints(source: string, _basePath: string): CodeEndpoint[] {
  const endpoints: CodeEndpoint[] = [];
  const lines = source.split("\n");

  let annotationBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";

    if (line.startsWith("@")) {
      annotationBuffer.push(line);
      continue;
    }

    if (annotationBuffer.length > 0 && /^(?:public|protected)\s/.test(line)) {
      let methodBlock = line;
      let j = i + 1;
      while (!methodBlock.includes("{") && j < lines.length) {
        methodBlock += " " + (lines[j]?.trim() ?? "");
        j++;
      }

      const endpoint = parseEndpointFromAnnotations(
        annotationBuffer.join("\n"),
        methodBlock,
        i + 1,
      );
      if (endpoint) {
        endpoints.push(endpoint);
      }
      annotationBuffer = [];
      continue;
    }

    if (!line.startsWith("@") && line.length > 0 && !line.startsWith("//") && !line.startsWith("*") && !line.startsWith("/*")) {
      annotationBuffer = [];
    }
  }

  return endpoints;
}

function parseEndpointFromAnnotations(
  annotations: string,
  methodBlock: string,
  lineNumber: number,
): CodeEndpoint | null {
  let httpMethods: HttpMethod[] = [];
  let path = "";

  const getMatch = RE_GET_MAPPING.exec(annotations);
  const postMatch = RE_POST_MAPPING.exec(annotations);
  const putMatch = RE_PUT_MAPPING.exec(annotations);
  const deleteMatch = RE_DELETE_MAPPING.exec(annotations);
  const patchMatch = RE_PATCH_MAPPING.exec(annotations);

  if (getMatch) { httpMethods.push("GET"); path = getMatch[1] ?? ""; }
  if (postMatch) { httpMethods.push("POST"); path = postMatch[1] ?? ""; }
  if (putMatch) { httpMethods.push("PUT"); path = putMatch[1] ?? ""; }
  if (deleteMatch) { httpMethods.push("DELETE"); path = deleteMatch[1] ?? ""; }
  if (patchMatch) { httpMethods.push("PATCH"); path = patchMatch[1] ?? ""; }

  if (httpMethods.length === 0) {
    const rmMatch = RE_REQUEST_MAPPING_METHOD.exec(annotations);
    if (rmMatch) {
      const rmContent = rmMatch[1] ?? "";
      const valueMatch = RE_RM_VALUE.exec(rmContent);
      path = valueMatch?.[1] ?? "";

      const methodsMatch = RE_RM_METHODS.exec(rmContent);
      if (methodsMatch) {
        const methodStr = methodsMatch[1] ?? "";
        for (const part of methodStr.split(",")) {
          const key = part.trim().toLowerCase();
          const mapped = HTTP_METHOD_MAP[key];
          if (mapped) httpMethods.push(mapped);
        }
      }

      if (httpMethods.length === 0) {
        httpMethods = ["GET"];
      }
    }
  }

  if (httpMethods.length === 0) return null;

  RE_METHOD_START.lastIndex = 0;
  const sigMatch = RE_METHOD_START.exec(methodBlock);
  if (!sigMatch) return null;

  const returnType = sigMatch[1] ?? "void";
  const methodName = sigMatch[2] ?? "unknown";

  // Extract parameter string between the opening ( and the matching )
  const paramStart = RE_METHOD_START.lastIndex; // position right after "("
  const paramStr = extractBalancedParens(methodBlock, paramStart);

  const parameters = parseParameters(paramStr);

  const apiOpMatch = RE_API_OPERATION.exec(annotations);

  return {
    httpMethod: httpMethods,
    path: path.startsWith("/") ? path : `/${path}`,
    methodName,
    parameters,
    returnType,
    swaggerSummary: apiOpMatch?.[1],
    lineNumber,
  };
}

function parseParameters(paramStr: string): CodeParam[] {
  if (!paramStr.trim()) return [];

  const params: CodeParam[] = [];
  const parts = splitParams(paramStr);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Try to match annotated parameter:
    // @RequestBody BalanceVO request
    // @PathVariable("id") Long id
    // @RequestParam(required=false) String keyword
    // @RequestParam int page
    const annotRegex = /@(RequestBody|PathVariable|RequestParam|ModelAttribute)(?:\s*\(([^)]*)\))?\s+([\w.<>,\s]+?)\s+(\w+)\s*$/;
    const annotMatch = annotRegex.exec(trimmed);
    if (annotMatch) {
      const annotType = annotMatch[1] ?? "";
      const annotArgs = annotMatch[2] ?? "";
      const paramType = annotMatch[3]?.trim() ?? "Object";
      const paramName = annotMatch[4] ?? "unknown";

      const isRequired = annotType !== "RequestParam" || !annotArgs.includes("required") || !annotArgs.includes("false");

      params.push({
        name: paramName,
        type: paramType,
        required: isRequired,
        annotation: `@${annotType}`,
      });
    } else {
      // No annotation — plain parameter: Type name
      const cleaned = trimmed.replace(/@\w+(?:\s*\([^)]*\))?\s*/g, "").trim();
      const tokens = cleaned.split(/\s+/).filter(Boolean);
      if (tokens.length >= 2) {
        const name = tokens[tokens.length - 1] ?? "unknown";
        const type = tokens.slice(0, -1).join(" ");
        params.push({ name, type, required: true });
      }
    }
  }

  return params;
}

function extractBalancedParens(source: string, startIndex: number): string {
  let depth = 1;
  let i = startIndex;
  while (i < source.length && depth > 0) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") depth--;
    if (depth > 0) i++;
  }
  return source.slice(startIndex, i);
}

function splitParams(paramStr: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of paramStr) {
    if (ch === "<") depth++;
    else if (ch === ">") depth--;
    else if (ch === "," && depth === 0) {
      result.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) result.push(current);
  return result;
}
