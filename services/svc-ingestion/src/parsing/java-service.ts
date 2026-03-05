import type { CodeTransaction, CodeParam } from "@ai-foundry/types";

const RE_CLASS_NAME = /(?:public\s+)?class\s+(\w+)/;
const RE_SERVICE = /@Service\b/;
const RE_TRANSACTIONAL = /@Transactional(?:\s*\(([^)]*)\))?/;
const RE_READ_ONLY = /readOnly\s*=\s*true/;

const RE_METHOD_SIG = /(?:public|protected)\s+([\S]+(?:<[^{]*?>)?)\s+(\w+)\s*\(([^)]*)\)/g;

export function isService(content: string): boolean {
  return RE_SERVICE.test(content);
}

export function parseJavaService(source: string, filename: string): CodeTransaction[] {
  if (!isService(source)) return [];

  const classMatch = RE_CLASS_NAME.exec(source);
  const className = classMatch?.[1] ?? filename.replace(".java", "");

  const transactions: CodeTransaction[] = [];
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

      const annotationText = annotationBuffer.join("\n");
      const txMatch = RE_TRANSACTIONAL.exec(annotationText);
      const isTransactional = txMatch !== null;

      RE_METHOD_SIG.lastIndex = 0;
      const sigMatch = RE_METHOD_SIG.exec(methodBlock);
      if (sigMatch) {
        const returnType = sigMatch[1] ?? "void";
        const methodName = sigMatch[2] ?? "unknown";
        const paramStr = sigMatch[3] ?? "";

        const readOnly = isTransactional && RE_READ_ONLY.test(txMatch?.[1] ?? "");

        transactions.push({
          className,
          methodName,
          parameters: parseSimpleParams(paramStr),
          returnType,
          isTransactional,
          readOnly,
          sourceFile: filename,
          lineNumber: i + 1,
        });
      }

      annotationBuffer = [];
      continue;
    }

    if (!line.startsWith("@") && line.length > 0 && !line.startsWith("//") && !line.startsWith("*") && !line.startsWith("/*")) {
      annotationBuffer = [];
    }
  }

  return transactions;
}

function parseSimpleParams(paramStr: string): CodeParam[] {
  if (!paramStr.trim()) return [];

  const params: CodeParam[] = [];
  const parts = splitParams(paramStr);

  for (const part of parts) {
    const trimmed = part.trim().replace(/@\w+(?:\s*\([^)]*\))?\s*/g, "");
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      const name = tokens[tokens.length - 1] ?? "unknown";
      const type = tokens.slice(0, -1).join(" ");
      params.push({ name, type, required: true });
    }
  }

  return params;
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
