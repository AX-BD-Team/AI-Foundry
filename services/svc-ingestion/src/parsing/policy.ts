import * as XLSX from "xlsx";
import type { UnstructuredElement } from "./unstructured.js";

// ── Types ──────────────────────────────────────────────────

export interface PolicyTriple {
  policyCode: string;
  category: string;
  classification: string[];
  condition: string;
  criteria: string;
  outcome: string;
  source: string;
}

export interface TermDefinition {
  name: string;
  englishName: string;
  definition: string;
  source: string;
}

export interface TransactionType {
  code: string;
  name: string;
  displayName: string;
  source: string;
}

export interface PolicyParseResult {
  policies: PolicyTriple[];
  terms: TermDefinition[];
  transactionTypes: TransactionType[];
  elements: UnstructuredElement[];
}

// ── Policy Code → Domain Condition Prefix ──────────────────

const POLICY_CODE_PREFIX: Record<string, string> = {
  "1": "발행",
  "2": "구매",
  "3": "결제",
  "4": "환불",
  "5": "선물",
};

// ── Sheet Detection Patterns ───────────────────────────────

const POLICY_SHEET_RE = /정책/;
const TERM_SHEET_RE = /용어/;
const TRANSACTION_SHEET_RE = /거래유형/;

// ── Header Detection Keywords ──────────────────────────────

const POLICY_HEADER_KEYWORDS = ["정책코드", "정책구분"];
const TERM_HEADER_KEYWORDS = ["용어", "영문"];
const TRANSACTION_HEADER_KEYWORDS = ["거래코드", "거래명"];

const HEADER_SCAN_ROWS = 10;
const MAX_CELL_LENGTH = 2000;

// ── Core Parser ────────────────────────────────────────────

export function parsePolicyWorkbook(
  fileBytes: ArrayBuffer,
  fileName: string,
): PolicyParseResult {
  const workbook = XLSX.read(new Uint8Array(fileBytes), { type: "array" });

  const policies: PolicyTriple[] = [];
  const terms: TermDefinition[] = [];
  const transactionTypes: TransactionType[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    if (POLICY_SHEET_RE.test(sheetName)) {
      policies.push(...parsePolicySheet(sheet, sheetName));
    } else if (TERM_SHEET_RE.test(sheetName)) {
      terms.push(...parseTermSheet(sheet, sheetName));
    } else if (TRANSACTION_SHEET_RE.test(sheetName)) {
      transactionTypes.push(...parseTransactionTypeSheet(sheet, sheetName));
    }
  }

  const elements = policyTriplesToElements(
    { policies, terms, transactionTypes, elements: [] },
    fileName,
  );

  return { policies, terms, transactionTypes, elements };
}

// ── Policy Sheet Parser ────────────────────────────────────

export function parsePolicySheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
): PolicyTriple[] {
  const headerInfo = findHeaderRow(sheet, POLICY_HEADER_KEYWORDS);
  if (!headerInfo) return [];

  const { headerRowIndex, headers } = headerInfo;
  const ref = sheet["!ref"];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);

  // Resolve column indices from header names
  const colCode = findColumnIndex(headers, ["정책코드"]);
  const colCategory = findColumnIndex(headers, ["정책구분"]);
  const colClass1 = findColumnIndex(headers, ["분류#1", "분류1"]);
  const colClass2 = findColumnIndex(headers, ["분류#2", "분류2"]);
  const colClass3 = findColumnIndex(headers, ["분류#3", "분류3"]);
  const colContent = findColumnIndex(headers, ["내용"]);
  const colDescription = findColumnIndex(headers, ["정책설명"]);

  const results: PolicyTriple[] = [];
  let lastPolicyCode = "";

  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    const rawCode = getCellValue(sheet, r, colCode);
    const category = getCellValue(sheet, r, colCategory);
    const class1 = getCellValue(sheet, r, colClass1);
    const class2 = getCellValue(sheet, r, colClass2);
    const class3 = getCellValue(sheet, r, colClass3);
    const content = getCellValue(sheet, r, colContent);
    const description = getCellValue(sheet, r, colDescription);

    // Skip entirely blank rows
    if (!rawCode && !category && !class1 && !content && !description) continue;

    // Merged cell handling: inherit previous policy code if current is empty
    const policyCode = rawCode || lastPolicyCode;
    if (rawCode) lastPolicyCode = rawCode;

    // Build classification array (filter out blanks)
    const classification = [class1, class2, class3].filter(Boolean);

    // Build condition from policy code prefix + classification
    const codeDigit = policyCode.replace(/^PP/, "").charAt(0);
    const domainPrefix = POLICY_CODE_PREFIX[codeDigit] ?? "";
    const conditionParts = [domainPrefix, ...classification].filter(Boolean);
    const condition = conditionParts.join(" > ");

    results.push({
      policyCode,
      category,
      classification,
      condition,
      criteria: content,
      outcome: description,
      source: sheetName,
    });
  }

  return results;
}

// ── Term Sheet Parser ──────────────────────────────────────

export function parseTermSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
): TermDefinition[] {
  const headerInfo = findHeaderRow(sheet, TERM_HEADER_KEYWORDS);
  if (!headerInfo) return [];

  const { headerRowIndex, headers } = headerInfo;
  const ref = sheet["!ref"];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);

  const colName = findColumnIndex(headers, ["용어", "용어명"]);
  const colEnglish = findColumnIndex(headers, ["영문명", "영문"]);
  const colDefinition = findColumnIndex(headers, ["정의", "설명"]);

  const results: TermDefinition[] = [];

  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    const name = getCellValue(sheet, r, colName);
    const englishName = getCellValue(sheet, r, colEnglish);
    const definition = getCellValue(sheet, r, colDefinition);

    if (!name) continue;

    results.push({ name, englishName, definition, source: sheetName });
  }

  return results;
}

// ── Transaction Type Sheet Parser ──────────────────────────

export function parseTransactionTypeSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
): TransactionType[] {
  const headerInfo = findHeaderRow(sheet, TRANSACTION_HEADER_KEYWORDS);
  if (!headerInfo) return [];

  const { headerRowIndex, headers } = headerInfo;
  const ref = sheet["!ref"];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);

  const colCode = findColumnIndex(headers, ["거래코드", "코드"]);
  const colName = findColumnIndex(headers, ["거래명"]);
  const colDisplay = findColumnIndex(headers, ["APP표시명", "표시명", "APP 표시명"]);

  const results: TransactionType[] = [];

  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    const code = getCellValue(sheet, r, colCode);
    const name = getCellValue(sheet, r, colName);
    const displayName = getCellValue(sheet, r, colDisplay);

    if (!code && !name) continue;

    results.push({ code, name, displayName, source: sheetName });
  }

  return results;
}

// ── Convert to UnstructuredElement[] ───────────────────────

export function policyTriplesToElements(
  result: PolicyParseResult,
  fileName: string,
): UnstructuredElement[] {
  const elements: UnstructuredElement[] = [];

  for (const p of result.policies) {
    elements.push({
      type: "XlPolicy",
      text: [
        `[${p.policyCode}] ${p.condition}`,
        `조건: ${p.condition}`,
        `기준: ${p.criteria}`,
        `결과: ${p.outcome}`,
      ].join("\n"),
      metadata: {
        policyCode: p.policyCode,
        category: p.category,
        classification: p.classification,
        source: p.source,
        fileName,
      },
    });
  }

  for (const t of result.terms) {
    elements.push({
      type: "XlTerm",
      text: `${t.name} (${t.englishName}): ${t.definition}`,
      metadata: {
        termName: t.name,
        englishName: t.englishName,
        source: t.source,
        fileName,
      },
    });
  }

  for (const tx of result.transactionTypes) {
    elements.push({
      type: "XlTransactionType",
      text: `${tx.code} ${tx.name} (${tx.displayName})`,
      metadata: {
        transactionCode: tx.code,
        transactionName: tx.name,
        displayName: tx.displayName,
        source: tx.source,
        fileName,
      },
    });
  }

  return elements;
}

// ── Helpers ────────────────────────────────────────────────

interface HeaderInfo {
  headerRowIndex: number;
  headers: string[];
}

function findHeaderRow(
  sheet: XLSX.WorkSheet,
  keywords: string[],
): HeaderInfo | null {
  const ref = sheet["!ref"];
  if (!ref) return null;

  const range = XLSX.utils.decode_range(ref);
  const scanEnd = Math.min(range.s.r + HEADER_SCAN_ROWS, range.e.r);

  for (let r = range.s.r; r <= scanEnd; r++) {
    const rowValues: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      rowValues.push(getCellValue(sheet, r, c));
    }

    const rowText = rowValues.join(" ");
    const hasKeyword = keywords.some((kw) => rowText.includes(kw));
    if (hasKeyword) {
      return { headerRowIndex: r, headers: rowValues };
    }
  }

  return null;
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

function getCellValue(sheet: XLSX.WorkSheet, row: number, col: number): string {
  if (col < 0) return "";
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr] as XLSX.CellObject | undefined;
  if (!cell) return "";
  const text = cell.w !== undefined ? cell.w : cell.v !== undefined ? String(cell.v) : "";
  return text.length > MAX_CELL_LENGTH ? text.slice(0, MAX_CELL_LENGTH) + "…" : text;
}
