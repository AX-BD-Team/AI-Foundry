import * as XLSX from "xlsx";
import type { UnstructuredElement } from "./unstructured.js";
import { shouldSkipSheet } from "./screen-design.js";

// ── SI Document Subtypes ────────────────────────────────────────

export type SiSubtype =
  | "화면설계"
  | "프로그램설계"
  | "테이블정의"
  | "배치설계"
  | "인터페이스설계"
  | "단위테스트"
  | "통합테스트"
  | "요구사항"
  | "업무규칙"
  | "코드정의"
  | "정책정의"
  | "공통"
  | "unknown";

const SI_PATTERNS: Array<{ pattern: RegExp; subtype: SiSubtype }> = [
  { pattern: /화면\s*설계/i, subtype: "화면설계" },
  { pattern: /(?:프로그램|PGM)\s*설계/i, subtype: "프로그램설계" },
  { pattern: /테이블\s*(?:정의|설계|목록)/i, subtype: "테이블정의" },
  { pattern: /배치\s*(?:설계|정의)/i, subtype: "배치설계" },
  { pattern: /(?:인터페이스|I\/F)\s*설계/i, subtype: "인터페이스설계" },
  { pattern: /단위\s*테스트/i, subtype: "단위테스트" },
  { pattern: /통합\s*테스트/i, subtype: "통합테스트" },
  { pattern: /요구\s*사항/i, subtype: "요구사항" },
  { pattern: /업무\s*규칙/i, subtype: "업무규칙" },
  { pattern: /코드\s*정의/i, subtype: "코드정의" },
  { pattern: /정책\s*(?:정의|관리)/i, subtype: "정책정의" },
  { pattern: /공통\s*(?:설계|정의|모듈)/i, subtype: "공통" },
];

/**
 * Detect SI document subtype from filename.
 * Returns "unknown" when no pattern matches.
 */
export function detectSiSubtype(fileName: string): SiSubtype {
  for (const { pattern, subtype } of SI_PATTERNS) {
    if (pattern.test(fileName)) return subtype;
  }
  return "unknown";
}

// ── Constants ───────────────────────────────────────────────────

const MAX_ROWS_PER_CHUNK = 40;
const MAX_CELL_LENGTH = 2000;

// ── Core Parser ─────────────────────────────────────────────────

/**
 * Parse an xlsx/xls file into UnstructuredElement[] preserving sheet/row/column structure.
 * Produces:
 *  - 1 XlWorkbook summary element (workbook overview)
 *  - N XlSheet:<siSubtype> elements (sheet content in Markdown table format, chunked by MAX_ROWS_PER_CHUNK)
 */
export function parseXlsx(fileBytes: ArrayBuffer, fileName: string): UnstructuredElement[] {
  const workbook = XLSX.read(new Uint8Array(fileBytes), { type: "array" });
  const siSubtype = detectSiSubtype(fileName);

  const elements: UnstructuredElement[] = [];

  // 1. Workbook summary
  const summary = buildWorkbookSummary(workbook, siSubtype, fileName);
  if (summary) {
    elements.push(summary);
  }

  // 2. Program design metadata (프로그램설계서: extract R3~R4 meta from first data sheet)
  if (siSubtype === "프로그램설계") {
    for (const sheetName of workbook.SheetNames) {
      if (shouldSkipSheet(sheetName)) continue;
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const meta = extractProgramMeta(sheet, sheetName);
      if (meta) {
        elements.push(meta);
      }
      break; // only first non-skipped sheet
    }
  }

  // 3. Sheet content chunks
  let isFirstActiveSheet = true;
  for (const sheetName of workbook.SheetNames) {
    if (shouldSkipSheet(sheetName)) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // 프로그램설계서: only the first active sheet has R0-R4 meta header.
    // Subsequent sheets use dataStartRow=0 (no meta to skip).
    const dataStartRow = (siSubtype === "프로그램설계" && isFirstActiveSheet) ? 5 : 0;
    isFirstActiveSheet = false;
    const chunks = sheetToMarkdownChunks(sheet, sheetName, siSubtype, MAX_ROWS_PER_CHUNK, dataStartRow);
    elements.push(...chunks);
  }

  return elements;
}

// ── Workbook Summary ────────────────────────────────────────────

export function buildWorkbookSummary(
  workbook: XLSX.WorkBook,
  siSubtype: SiSubtype,
  fileName: string,
): UnstructuredElement | null {
  if (workbook.SheetNames.length === 0) return null;

  let skippedCount = 0;
  const activeSheets: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (shouldSkipSheet(sheetName)) {
      skippedCount++;
    } else {
      activeSheets.push(sheetName);
    }
  }

  const lines: string[] = [
    `# Workbook: ${fileName}`,
    `- SI Subtype: ${siSubtype}`,
    `- Sheets: ${workbook.SheetNames.length}` +
      (skippedCount > 0 ? ` (${skippedCount} skipped)` : ""),
    "",
  ];

  for (const sheetName of activeSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    const rowCount = range.e.r - range.s.r + 1;
    const colCount = range.e.c - range.s.c + 1;

    // Extract header row
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r: range.s.r, c });
      const cell = sheet[cellAddr] as XLSX.CellObject | undefined;
      headers.push(cell ? truncateCell(getCellText(cell)) : "");
    }

    const headerStr = headers.filter(Boolean).join(", ");
    lines.push(`## ${sheetName} (${rowCount} rows × ${colCount} cols)`);
    if (headerStr) {
      lines.push(`  Headers: ${headerStr}`);
    }
    lines.push("");
  }

  const metadata: Record<string, unknown> = {
    siSubtype,
    sheetCount: workbook.SheetNames.length,
  };
  if (skippedCount > 0) {
    metadata["skippedSheets"] = skippedCount;
  }

  return {
    type: "XlWorkbook",
    text: lines.join("\n").trim(),
    metadata,
  };
}

// ── Sheet → Markdown Chunks ─────────────────────────────────────

export function sheetToMarkdownChunks(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  siSubtype: SiSubtype,
  maxRows: number = MAX_ROWS_PER_CHUNK,
  dataStartRow: number = 0,
): UnstructuredElement[] {
  const ref = sheet["!ref"];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  const totalRows = range.e.r - range.s.r + 1;

  if (totalRows === 0) return [];

  // Read all rows as string[][]
  const allRows = readSheetRows(sheet, range);

  // Apply dataStartRow offset (e.g., skip meta rows in 프로그램설계서)
  const rows = dataStartRow > 0 ? allRows.slice(dataStartRow) : allRows;

  // Skip entirely empty sheets
  if (rows.every((row) => row.every((cell) => !cell))) return [];

  // Extract header row (first row after offset)
  const headerRow = rows[0];
  if (!headerRow) return [];

  const elements: UnstructuredElement[] = [];
  const dataRows = rows.slice(1);

  // Chunk data rows
  for (let i = 0; i < dataRows.length; i += maxRows) {
    const chunk = dataRows.slice(i, i + maxRows);

    // Skip chunks where all rows are empty
    if (chunk.every((row) => row.every((cell) => !cell))) continue;

    const chunkIndex = Math.floor(i / maxRows);
    const totalChunks = Math.ceil(dataRows.length / maxRows);
    const md = buildMarkdownTable(headerRow, chunk);

    if (!md.trim()) continue;

    const text = [
      `## ${sheetName} [${chunkIndex + 1}/${totalChunks}]`,
      "",
      md,
    ].join("\n");

    elements.push({
      type: `XlSheet:${siSubtype}`,
      text,
      metadata: {
        sheetName,
        siSubtype,
        chunkIndex,
        totalChunks,
        rowStart: range.s.r + 1 + i, // 1-indexed, skip header
        rowEnd: range.s.r + 1 + Math.min(i + maxRows, dataRows.length) - 1,
      },
    });
  }

  // Edge case: header-only sheet (no data rows) — still emit one chunk
  if (dataRows.length === 0) {
    const md = buildMarkdownTable(headerRow, []);
    if (md.trim()) {
      elements.push({
        type: `XlSheet:${siSubtype}`,
        text: `## ${sheetName} [1/1]\n\n${md}`,
        metadata: { sheetName, siSubtype, chunkIndex: 0, totalChunks: 1 },
      });
    }
  }

  return elements;
}

// ── Program Design Metadata ─────────────────────────────────────

/**
 * Extract metadata from 프로그램설계서 header area (Excel rows 1–4).
 * Layout (Excel 1-based addresses):
 *   Row 1: A1="퇴직연금 시스템 재구축 프로젝트", last col="프로그램설계서"
 *   Row 3: A3="프로그램 ID(BeanID)", B3=[value], D3="프로그램 명", E3=[value]
 *   Row 4: A4="고객담당자", B4=[value], D4="설계담당자", E4=[value]
 *   Row 6: column headers
 *   Row 7+: data rows
 */
export function extractProgramMeta(
  sheet: XLSX.WorkSheet,
  sheetName: string,
): UnstructuredElement | null {
  const ref = sheet["!ref"];
  if (!ref) return null;

  const range = XLSX.utils.decode_range(ref);
  // Need at least 4 rows (rows 0-3)
  if (range.e.r < 3) return null;

  const getCellValue = (r: number, c: number): string => {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = sheet[addr] as XLSX.CellObject | undefined;
    if (!cell) return "";
    return getCellText(cell).trim();
  };

  // Row 2: 프로그램ID, 프로그램명
  const programId = getCellValue(2, 1); // B3
  const programName = getCellValue(2, 4); // E3

  // Row 3: 고객담당자, 설계담당자
  const customerManager = getCellValue(3, 1); // B4
  const designManager = getCellValue(3, 4); // E4

  // If no meaningful data found, skip
  if (!programId && !programName && !customerManager && !designManager) {
    return null;
  }

  const lines: string[] = [
    `# 프로그램설계서: ${programName || sheetName}`,
    "",
    `- 프로그램ID: ${programId}`,
    `- 프로그램명: ${programName}`,
    `- 고객담당자: ${customerManager}`,
    `- 설계담당자: ${designManager}`,
  ];

  return {
    type: "XlProgramMeta",
    text: lines.join("\n"),
    metadata: {
      sheetName,
      siSubtype: "프로그램설계" as const,
      programId,
      programName,
      customerManager,
      designManager,
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function readSheetRows(
  sheet: XLSX.WorkSheet,
  range: XLSX.Range,
): string[][] {
  const rows: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[cellAddr] as XLSX.CellObject | undefined;
      row.push(cell ? truncateCell(getCellText(cell)) : "");
    }
    rows.push(row);
  }
  return rows;
}

function getCellText(cell: XLSX.CellObject): string {
  if (cell.w !== undefined) return cell.w;
  if (cell.v !== undefined) return String(cell.v);
  return "";
}

function truncateCell(value: string): string {
  if (value.length <= MAX_CELL_LENGTH) return value;
  return value.slice(0, MAX_CELL_LENGTH) + "…";
}

function buildMarkdownTable(headers: string[], dataRows: string[][]): string {
  // Sanitize pipe characters in cell content
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

  const headerLine = "| " + headers.map(esc).join(" | ") + " |";
  const separatorLine = "| " + headers.map(() => "---").join(" | ") + " |";

  const lines = [headerLine, separatorLine];

  for (const row of dataRows) {
    // Pad row to match header length
    const padded = headers.map((_, i) => row[i] ?? "");
    lines.push("| " + padded.map(esc).join(" | ") + " |");
  }

  return lines.join("\n");
}
