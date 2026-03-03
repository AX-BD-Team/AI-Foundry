import { createLogger } from "@ai-foundry/utils";

export type ErrorType = "format_invalid" | "parse_error" | "timeout" | "network_error";

export interface ValidationResult {
  valid: boolean;
  label: string | null;
  error: string | null;
}

interface MagicSignature {
  bytes: number[];
  label: string;
}

const SIGNATURES: Record<string, MagicSignature[]> = {
  xlsx: [{ bytes: [0x50, 0x4b, 0x03, 0x04], label: "ZIP/PK" }],
  docx: [{ bytes: [0x50, 0x4b, 0x03, 0x04], label: "ZIP/PK" }],
  pptx: [{ bytes: [0x50, 0x4b, 0x03, 0x04], label: "ZIP/PK" }],
  xls: [{ bytes: [0xd0, 0xcf, 0x11, 0xe0], label: "OLE2" }],
  ppt: [{ bytes: [0xd0, 0xcf, 0x11, 0xe0], label: "OLE2" }],
  doc: [{ bytes: [0xd0, 0xcf, 0x11, 0xe0], label: "OLE2" }],
  pdf: [{ bytes: [0x25, 0x50, 0x44, 0x46], label: "%PDF" }],
  png: [{ bytes: [0x89, 0x50, 0x4e, 0x47], label: "PNG" }],
  jpg: [{ bytes: [0xff, 0xd8, 0xff], label: "JPEG" }],
  jpeg: [{ bytes: [0xff, 0xd8, 0xff], label: "JPEG" }],
};

/**
 * Validate file bytes against expected magic signatures for the given file type.
 * Returns { valid: true } if magic bytes match, or { valid: false, error } if not.
 * File types without known signatures (e.g. txt) are always considered valid.
 */
export function validateFileFormat(fileBytes: ArrayBuffer, fileType: string): ValidationResult {
  const logger = createLogger("svc-ingestion:validator");
  const sigs = SIGNATURES[fileType];

  if (!sigs) {
    return { valid: true, label: null, error: null };
  }

  if (fileBytes.byteLength < 4) {
    return { valid: false, label: null, error: "File too small to identify format" };
  }

  const header = new Uint8Array(fileBytes, 0, Math.min(fileBytes.byteLength, 8));

  for (const sig of sigs) {
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      const expected = sig.bytes[i];
      if (expected === undefined || header[i] !== expected) {
        match = false;
        break;
      }
    }
    if (match) {
      return { valid: true, label: sig.label, error: null };
    }
  }

  const headerHex = Array.from(header.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");

  logger.warn("Magic byte mismatch", { fileType, headerHex });
  return {
    valid: false,
    label: null,
    error: `Expected ${sigs.map((s) => s.label).join(" or ")} header for .${fileType}, got: ${headerHex}`,
  };
}

/**
 * Classify a caught error into an ErrorType for structured error reporting.
 */
export function classifyParseError(error: unknown): ErrorType {
  if (!(error instanceof Error)) return "parse_error";

  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (name === "aborterror" || msg.includes("abort") || msg.includes("timeout")) {
    return "timeout";
  }
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("econnrefused")) {
    return "network_error";
  }
  return "parse_error";
}
