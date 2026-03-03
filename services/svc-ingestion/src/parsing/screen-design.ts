import * as XLSX from "xlsx";
import type { UnstructuredElement } from "./unstructured.js";

// ── Constants ───────────────────────────────────────────────────

const MAX_CELL_LENGTH = 2000;

// ── Sheet Skip Helpers (exported for reuse in xlsx.ts) ──────────

export const SKIP_SHEET_PATTERNS = ["표지", "제개정이력"];
export const SKIP_SHEET_REGEXPS = [/샘플/, /작성가이드/, /명명규칙/];

/**
 * Returns true if the sheet name matches a known noise pattern
 * (cover page, revision history, sample/guide sheets, naming conventions).
 */
export function shouldSkipSheet(sheetName: string): boolean {
  if (SKIP_SHEET_PATTERNS.includes(sheetName)) return true;
  return SKIP_SHEET_REGEXPS.some((re) => re.test(sheetName));
}

// ── Types ───────────────────────────────────────────────────────

export interface SectionRange {
  /** Section number, e.g. 1, 2, 3, 4, 5 */
  sectionNum: number;
  /** Section title text, e.g. "1. 매뉴 레이아웃" */
  title: string;
  /** Start row (0-based, inclusive) */
  startRow: number;
  /** End row (0-based, inclusive) */
  endRow: number;
}

// ── Main Parser ─────────────────────────────────────────────────

/**
 * Parse a 화면설계서 (screen design) xlsx file into structured UnstructuredElement[].
 *
 * Each sheet (tab) represents one screen. Produces element types:
 * - XlScreenMeta: screen metadata (name, ID, classification, service class)
 * - XlScreenLayout: UI field key-value pairs (section 1 layout)
 * - XlScreenData: data field table (section 3)
 * - XlScreenLogic: processing logic table (section 4) — most important output
 * - XlScreenNote: business notes (section 5)
 */
export function parseScreenDesign(
  fileBytes: ArrayBuffer,
  fileName: string,
): UnstructuredElement[] {
  const workbook = XLSX.read(new Uint8Array(fileBytes), { type: "array" });
  const elements: UnstructuredElement[] = [];

  // Build workbook summary (same pattern as parseXlsx for Stage 2 context)
  const summary = buildScreenWorkbookSummary(workbook, fileName);
  if (summary) {
    elements.push(summary);
  }

  for (const sheetName of workbook.SheetNames) {
    if (shouldSkipSheet(sheetName)) continue;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Skip sheets with no data
    const ref = sheet["!ref"];
    if (!ref) continue;

    const sheetElements = parseScreenSheet(sheet, sheetName, fileName);
    elements.push(...sheetElements);
  }

  return elements;
}

// ── Per-Sheet Processing ────────────────────────────────────────

function parseScreenSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  fileName: string,
): UnstructuredElement[] {
  const elements: UnstructuredElement[] = [];

  // Detect sections first — sheets without section markers are not screen design sheets
  const sections = detectSections(sheet);
  if (sections.length === 0) return elements;

  // Extract meta only for sheets with sections (prevents false-positive from data sheets)
  const meta = extractScreenMeta(sheet, sheetName);
  if (meta) {
    elements.push(meta);
  }

  for (const section of sections) {
    const title = section.title.toLowerCase();

    if (title.includes("레이아웃") && !title.includes("참고") && !title.includes("기존")) {
      // Section 1: menu layout — UI field key-value pairs
      const kvElement = extractKeyValuePairs(sheet, section);
      if (kvElement) {
        elements.push({
          ...kvElement,
          metadata: { ...kvElement.metadata, sheetName, fileName },
        });
      }
    } else if (title.includes("데이터") && title.includes("구성")) {
      // Section 3: data fields
      const dataElement = parseDataFields(sheet, section);
      if (dataElement) {
        elements.push({
          ...dataElement,
          metadata: { ...dataElement.metadata, sheetName, fileName },
        });
      }
    } else if (title.includes("처리") && title.includes("로직")) {
      // Section 4: processing logic
      const logicElement = parseProcessingLogic(sheet, section);
      if (logicElement) {
        elements.push({
          ...logicElement,
          metadata: { ...logicElement.metadata, sheetName, fileName },
        });
      }
    } else if (title.includes("추가") && title.includes("설명")) {
      // Section 5: business notes
      const noteElement = extractFreeText(sheet, section);
      if (noteElement) {
        elements.push({
          ...noteElement,
          metadata: { ...noteElement.metadata, sheetName, fileName },
        });
      }
    }
    // Section 2 (참고/기존 레이아웃) is intentionally skipped
  }

  return elements;
}

// ── Meta Extraction ─────────────────────────────────────────────

/**
 * Extract screen metadata from rows 1-6 (0-based: 0-5).
 *
 * Expected structure (0-based row/col):
 * - R0 (row 0): A0 = system name (e.g. "퇴직연금시스템")
 * - R2 (row 2): B2 = "화면명", H2 = value, P2 = "화면ID" or the ID value
 * - R3 (row 3): B3 = "대분류", H3 = value, P3 = "중분류", V3 = value
 * - R4 (row 4): B4 = "화면설명", H4 = value
 * - R5 (row 5): B5 = "서비스클래스ID", H5 = value
 */
export function extractScreenMeta(
  sheet: XLSX.WorkSheet,
  sheetName: string,
): UnstructuredElement | null {
  const systemName = getCellValue(sheet, 0, 0); // A1

  // Row 2 (0-based): screen name and screen ID
  const screenName = getCellValue(sheet, 2, 7); // H3
  const screenIdArea = getCellValue(sheet, 2, 15); // P3

  // Determine screen ID: P3 might be "화면ID" label or the actual value.
  // Use exact label comparison to avoid false negatives when an ID literally contains "화면".
  const SCREEN_ID_LABEL = "화면ID";
  let screenId = "";
  if (screenIdArea && screenIdArea.trim() !== SCREEN_ID_LABEL) {
    // P3 is the actual ID value (not the label)
    screenId = screenIdArea;
  } else {
    // P3 is "화면ID" label — search nearby cells (Q3~V3) for the value
    for (let c = 16; c <= 21; c++) {
      const val = getCellValue(sheet, 2, c);
      if (val) {
        screenId = val;
        break;
      }
    }
  }

  // Row 3 (0-based): classification
  const majorCategory = getCellValue(sheet, 3, 7); // H4
  const minorCategory = getCellValue(sheet, 3, 21); // V4

  // Row 4 (0-based): screen description
  const screenDesc = getCellValue(sheet, 4, 7); // H5

  // Row 5 (0-based): service class ID
  const serviceClassId = getCellValue(sheet, 5, 7); // H6

  // If nothing meaningful was extracted, skip
  if (!screenName && !screenId && !systemName) return null;

  const lines: string[] = [];
  if (systemName) lines.push(`시스템: ${systemName}`);
  if (screenName) lines.push(`화면명: ${screenName}`);
  if (screenId) lines.push(`화면ID: ${screenId}`);
  if (majorCategory) lines.push(`대분류: ${majorCategory}`);
  if (minorCategory) lines.push(`중분류: ${minorCategory}`);
  if (screenDesc) lines.push(`화면설명: ${screenDesc}`);
  if (serviceClassId) lines.push(`서비스클래스ID: ${serviceClassId}`);

  if (lines.length === 0) return null;

  const metaObj: Record<string, unknown> = { sheetName };
  if (screenName) metaObj["screenName"] = screenName;
  if (screenId) metaObj["screenId"] = screenId;
  if (majorCategory) metaObj["majorCategory"] = majorCategory;
  if (minorCategory) metaObj["minorCategory"] = minorCategory;
  if (serviceClassId) metaObj["serviceClassId"] = serviceClassId;

  return {
    type: "XlScreenMeta",
    text: lines.join("\n"),
    metadata: metaObj,
  };
}

// ── Section Detection ───────────────────────────────────────────

/**
 * Scan columns A-C looking for section markers matching "N." pattern
 * (e.g. "1.", "2.", "3.", "4.", "5.").
 *
 * Returns SectionRange[] with start/end rows for each section.
 */
export function detectSections(sheet: XLSX.WorkSheet): SectionRange[] {
  const ref = sheet["!ref"];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  const sectionStarts: Array<{ sectionNum: number; title: string; row: number }> = [];

  // Section marker pattern: starts with a single digit (1-9) followed by a dot.
  // Capped at 1-9 to avoid matching version numbers ("10.0") or decimals ("3.14").
  const sectionPattern = /^([1-9])\.\s*/;

  for (let r = range.s.r; r <= range.e.r; r++) {
    // Scan columns A(0), B(1), C(2) for section markers
    const maxCol = Math.min(2, range.e.c);
    for (let c = 0; c <= maxCol; c++) {
      const text = getCellValue(sheet, r, c);
      if (!text) continue;

      const trimmed = text.trim();
      const match = sectionPattern.exec(trimmed);
      if (match) {
        const numStr = match[1];
        if (!numStr) continue;
        const num = parseInt(numStr, 10);
        if (num > 0) {
          sectionStarts.push({
            sectionNum: num,
            title: trimmed,
            row: r,
          });
          break; // Only match one column per row
        }
      }
    }
  }

  // Build SectionRange[] — endRow is next section start - 1, or last row
  const sections: SectionRange[] = [];
  for (let i = 0; i < sectionStarts.length; i++) {
    const current = sectionStarts[i];
    if (!current) continue;

    const next = sectionStarts[i + 1];
    const endRow = next ? next.row - 1 : range.e.r;

    sections.push({
      sectionNum: current.sectionNum,
      title: current.title,
      startRow: current.row,
      endRow,
    });
  }

  return sections;
}

// ── Section 3: Data Fields Parser ───────────────────────────────

const DATA_FIELD_KEYWORDS = ["항목명", "컨트롤", "필수", "I/O", "타입", "유형"];

/**
 * Parse section 3 "데이터 구성항목" — extract table with columns:
 * 항목명(한글), 컨트롤 유형, 컨트롤(영문), 필수, I/O/H, 타입
 *
 * Outputs as Markdown table.
 */
export function parseDataFields(
  sheet: XLSX.WorkSheet,
  range: SectionRange,
): UnstructuredElement | null {
  const { headerRow, headerCols, dataStartRow } = findTableHeader(
    sheet,
    range,
    DATA_FIELD_KEYWORDS,
  );
  if (!headerRow || headerCols.length === 0) return null;

  const rows = extractTableRows(sheet, dataStartRow, range.endRow, headerCols);
  if (rows.length === 0) return null;

  const md = buildMarkdownTable(headerRow, rows);
  return {
    type: "XlScreenData",
    text: `### 데이터 구성항목\n\n${md}`,
    metadata: { section: range.title, rowCount: rows.length },
  };
}

// ── Section 4: Processing Logic Parser ──────────────────────────

const LOGIC_KEYWORDS = ["이벤트", "파라미터", "입력값", "처리내용", "처리", "로직"];

/**
 * Parse section 4 "처리로직" — extract table with columns:
 * 이벤트명, 입력값/파라미터, 처리내용
 *
 * This is the most important output for knowledge extraction.
 */
export function parseProcessingLogic(
  sheet: XLSX.WorkSheet,
  range: SectionRange,
): UnstructuredElement | null {
  const { headerRow, headerCols, dataStartRow } = findTableHeader(
    sheet,
    range,
    LOGIC_KEYWORDS,
  );
  if (!headerRow || headerCols.length === 0) return null;

  const rows = extractTableRows(sheet, dataStartRow, range.endRow, headerCols);
  if (rows.length === 0) return null;

  const md = buildMarkdownTable(headerRow, rows);
  return {
    type: "XlScreenLogic",
    text: `### 처리로직\n\n${md}`,
    metadata: { section: range.title, rowCount: rows.length },
  };
}

// ── Section 1: Layout Key-Value Parser ──────────────────────────

/**
 * Extract UI field key-value pairs from section 1 layout area.
 *
 * Heuristic: scan rows for non-empty cells. In rows with 2+ non-empty cells,
 * treat alternating cells as label-value pairs (odd position = label, even = value).
 */
export function extractKeyValuePairs(
  sheet: XLSX.WorkSheet,
  range: SectionRange,
): UnstructuredElement | null {
  const ref = sheet["!ref"];
  if (!ref) return null;

  const sheetRange = XLSX.utils.decode_range(ref);
  const pairs: Array<{ label: string; value: string }> = [];

  // Start from the row after the section marker
  const startRow = range.startRow + 1;

  for (let r = startRow; r <= range.endRow; r++) {
    const cells: Array<{ col: number; text: string }> = [];

    for (let c = sheetRange.s.c; c <= sheetRange.e.c; c++) {
      const text = getCellValue(sheet, r, c);
      if (text) {
        cells.push({ col: c, text });
      }
    }

    // Need at least 2 cells to form a label-value pair
    if (cells.length < 2) continue;

    // Pair up: cells[0]=label, cells[1]=value, cells[2]=label, cells[3]=value, ...
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const labelCell = cells[i];
      const valueCell = cells[i + 1];
      if (labelCell && valueCell) {
        pairs.push({
          label: truncateCell(labelCell.text),
          value: truncateCell(valueCell.text),
        });
      }
    }
  }

  if (pairs.length === 0) return null;

  const lines = pairs.map((p) => `- ${p.label}: ${p.value}`);
  return {
    type: "XlScreenLayout",
    text: `### UI 레이아웃 필드\n\n${lines.join("\n")}`,
    metadata: { section: range.title, fieldCount: pairs.length },
  };
}

// ── Section 5: Free Text Parser ─────────────────────────────────

function extractFreeText(
  sheet: XLSX.WorkSheet,
  range: SectionRange,
): UnstructuredElement | null {
  const ref = sheet["!ref"];
  if (!ref) return null;

  const sheetRange = XLSX.utils.decode_range(ref);
  const lines: string[] = [];

  // Start from the row after the section marker
  const startRow = range.startRow + 1;

  for (let r = startRow; r <= range.endRow; r++) {
    const rowTexts: string[] = [];
    for (let c = sheetRange.s.c; c <= sheetRange.e.c; c++) {
      const text = getCellValue(sheet, r, c);
      if (text) {
        rowTexts.push(truncateCell(text));
      }
    }
    if (rowTexts.length > 0) {
      lines.push(rowTexts.join(" "));
    }
  }

  if (lines.length === 0) return null;

  return {
    type: "XlScreenNote",
    text: `### 현업 추가 설명\n\n${lines.join("\n")}`,
    metadata: { section: range.title },
  };
}

// ── Table Parsing Helpers ───────────────────────────────────────

interface TableHeaderResult {
  /** Header cell texts */
  headerRow: string[] | null;
  /** Column indices of detected header cells */
  headerCols: number[];
  /** Row index where data begins (header row + 1) */
  dataStartRow: number;
}

/**
 * Scan section rows to find the header row matching keyword patterns.
 * Requires at least 2 keyword matches to identify a row as a header.
 */
function findTableHeader(
  sheet: XLSX.WorkSheet,
  range: SectionRange,
  keywords: string[],
): TableHeaderResult {
  const ref = sheet["!ref"];
  if (!ref) return { headerRow: null, headerCols: [], dataStartRow: range.endRow + 1 };

  const sheetRange = XLSX.utils.decode_range(ref);

  // Start from the row after the section marker
  for (let r = range.startRow + 1; r <= range.endRow; r++) {
    const cells: Array<{ col: number; text: string }> = [];

    for (let c = sheetRange.s.c; c <= sheetRange.e.c; c++) {
      const text = getCellValue(sheet, r, c);
      if (text) {
        cells.push({ col: c, text: text.trim() });
      }
    }

    // Check if this row contains enough keywords to be a header
    let matchCount = 0;
    for (const cell of cells) {
      const cellLower = cell.text.toLowerCase();
      for (const kw of keywords) {
        if (cellLower.includes(kw.toLowerCase())) {
          matchCount++;
          break;
        }
      }
    }

    // Require at least 2 keyword matches to identify as header
    if (matchCount >= 2) {
      const headerRow = cells.map((c) => c.text);
      const headerCols = cells.map((c) => c.col);
      return { headerRow, headerCols, dataStartRow: r + 1 };
    }
  }

  return { headerRow: null, headerCols: [], dataStartRow: range.endRow + 1 };
}

/**
 * Extract data rows from startRow to endRow using column ranges (buckets).
 *
 * In heavily-merged 78-column layouts, data values may not be at the exact
 * header column position. Instead, we compute a range (bucket) for each header
 * column: [headerCol[i], headerCol[i+1] - 1], and find the first non-empty
 * cell within that range for each data row.
 */
function extractTableRows(
  sheet: XLSX.WorkSheet,
  startRow: number,
  endRow: number,
  headerCols: number[],
): string[][] {
  const ref = sheet["!ref"];
  const sheetEnd = ref ? XLSX.utils.decode_range(ref).e.c : 77;

  // Build column buckets: each header col gets a range [start, end]
  const buckets: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < headerCols.length; i++) {
    const colIdx = headerCols[i];
    if (colIdx === undefined) continue;
    const nextCol = headerCols[i + 1];
    const bucketEnd = nextCol !== undefined ? nextCol - 1 : Math.min(colIdx + 15, sheetEnd);
    buckets.push({ start: colIdx, end: bucketEnd });
  }

  const rows: string[][] = [];

  for (let r = startRow; r <= endRow; r++) {
    const row: string[] = [];
    let hasContent = false;

    for (const bucket of buckets) {
      let cellText = "";
      // Try exact column first, then scan bucket range
      const exactVal = getCellValue(sheet, r, bucket.start);
      if (exactVal) {
        cellText = exactVal;
      } else {
        for (let c = bucket.start + 1; c <= bucket.end; c++) {
          const val = getCellValue(sheet, r, c);
          if (val) {
            cellText = val;
            break;
          }
        }
      }
      const truncated = cellText ? truncateCell(cellText) : "";
      row.push(truncated);
      if (truncated) hasContent = true;
    }

    if (hasContent) {
      rows.push(row);
    }
  }

  return rows;
}

// ── Markdown Table Builder ──────────────────────────────────────

function buildMarkdownTable(headers: string[], dataRows: string[][]): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

  const headerLine = "| " + headers.map(esc).join(" | ") + " |";
  const separatorLine = "| " + headers.map(() => "---").join(" | ") + " |";

  const lines = [headerLine, separatorLine];

  for (const row of dataRows) {
    const padded = headers.map((_, i) => row[i] ?? "");
    lines.push("| " + padded.map(esc).join(" | ") + " |");
  }

  return lines.join("\n");
}

// ── Cell Helpers ────────────────────────────────────────────────

function getCellValue(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr] as XLSX.CellObject | undefined;
  if (!cell) return "";
  const text = cell.w ?? (cell.v !== undefined ? String(cell.v) : "");
  return text;
}

function truncateCell(value: string): string {
  if (value.length <= MAX_CELL_LENGTH) return value;
  return value.slice(0, MAX_CELL_LENGTH) + "...";
}

// ── Workbook Summary ────────────────────────────────────────────

/**
 * Build a workbook-level summary element for 화면설계서.
 * Provides Stage 2 with context about total sheets, skipped sheets, etc.
 */
function buildScreenWorkbookSummary(
  workbook: XLSX.WorkBook,
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

  // No active sheets → no summary (all noise sheets)
  if (activeSheets.length === 0) return null;

  const lines: string[] = [
    `# Workbook: ${fileName}`,
    `- SI Subtype: 화면설계`,
    `- Sheets: ${workbook.SheetNames.length}` +
      (skippedCount > 0 ? ` (${skippedCount} skipped)` : ""),
    `- Active screens: ${activeSheets.length}`,
    "",
    ...activeSheets.map((name) => `- ${name}`),
  ];

  const metadata: Record<string, unknown> = {
    siSubtype: "화면설계",
    sheetCount: workbook.SheetNames.length,
    activeSheetCount: activeSheets.length,
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
