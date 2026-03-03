import { unzipSync } from "fflate";
import { createLogger } from "@ai-foundry/utils";
import type { UnstructuredElement } from "./unstructured.js";

const logger = createLogger("svc-ingestion:docx-parser");

// ── WordprocessingML namespace prefix ───────────────────────────
// DOCX XML uses namespace prefix "w:" for word processing elements.

// ── Heading style patterns ──────────────────────────────────────
// English: Heading1, Heading2, ... / Korean: 1, 2, ...
const HEADING1_RE = /^(?:Heading\s*1|제목\s*1|heading1|TOCHeading)$/i;
const HEADING2_RE = /^(?:Heading\s*2|제목\s*2|heading2)$/i;
const HEADING_OTHER_RE = /^(?:Heading\s*[3-9]|제목\s*[3-9]|heading[3-9])$/i;

// ── XML regex patterns ──────────────────────────────────────────
// These operate on the raw XML string from word/document.xml.

/** Match a complete <w:tbl>...</w:tbl> block (non-greedy). */
const TABLE_RE = /<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/g;

/** Match a complete <w:p>...</w:p> block (non-greedy). */
const PARAGRAPH_RE = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;

/** Match <w:pStyle w:val="..."/> to detect paragraph style. */
const PSTYLE_RE = /<w:pStyle\s+w:val="([^"]+)"/;

/** Match <w:numPr> to detect list items. */
const NUMPR_RE = /<w:numPr\b/;

/** Match all <w:t ...>text</w:t> elements. */
const TEXT_RE = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;

/** Match <w:tr>...</w:tr> table rows. */
const ROW_RE = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;

/** Match <w:tc>...</w:tc> table cells. */
const CELL_RE = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;

/** Match <w:tab/> elements (used for tab characters). */
const TAB_RE = /<w:tab\s*\/>/g;

/** Match <w:br/> or <w:br ...> elements (line breaks). */
const BR_RE = /<w:br\b[^/]*\/?>/g;

// ── Public API ──────────────────────────────────────────────────

/**
 * Parse a DOCX file (ZIP containing XML) into UnstructuredElement[].
 *
 * Steps:
 *  1. Unzip the DOCX using fflate
 *  2. Locate word/document.xml
 *  3. Extract paragraphs and tables using regex-based XML parsing
 *  4. Classify each element (Title, Header, NarrativeText, ListItem, Table)
 *
 * Works in Cloudflare Workers (no Node.js APIs, no DOMParser).
 */
export function parseDocx(fileBytes: ArrayBuffer, filename: string): UnstructuredElement[] {
  logger.info("Starting DOCX parse", { filename, sizeBytes: fileBytes.byteLength });

  // 1. Unzip
  const zipEntries = unzipSync(new Uint8Array(fileBytes));

  // 2. Find word/document.xml
  const docXmlBytes = zipEntries["word/document.xml"];
  if (!docXmlBytes) {
    throw new Error("Invalid DOCX: word/document.xml not found in archive");
  }

  const xmlString = new TextDecoder("utf-8").decode(docXmlBytes);

  // 3. Parse: extract tables first, then remaining paragraphs
  const elements = parseDocumentXml(xmlString);

  logger.info("DOCX parse complete", {
    filename,
    elementCount: elements.length,
    types: summarizeTypes(elements),
  });

  return elements;
}

// ── XML Parsing ─────────────────────────────────────────────────

/**
 * Parse the document.xml content into UnstructuredElement[].
 *
 * Strategy:
 *  - First pass: find all <w:tbl> blocks and record their positions
 *  - Second pass: iterate top-level <w:p> blocks that are NOT inside tables
 *  - Tables produce Table elements; paragraphs produce Title/Header/NarrativeText/ListItem
 */
function parseDocumentXml(xml: string): UnstructuredElement[] {
  const elements: UnstructuredElement[] = [];

  // Find all table ranges to exclude their paragraphs from top-level iteration
  const tableRanges: Array<{ start: number; end: number }> = [];
  TABLE_RE.lastIndex = 0;
  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = TABLE_RE.exec(xml)) !== null) {
    tableRanges.push({
      start: tableMatch.index,
      end: tableMatch.index + tableMatch[0].length,
    });
  }

  // Collect all top-level content blocks (paragraphs + tables) in document order
  type ContentBlock =
    | { kind: "paragraph"; index: number; match: RegExpExecArray }
    | { kind: "table"; index: number; match: RegExpExecArray };

  const blocks: ContentBlock[] = [];

  // Add table blocks
  TABLE_RE.lastIndex = 0;
  while ((tableMatch = TABLE_RE.exec(xml)) !== null) {
    blocks.push({ kind: "table", index: tableMatch.index, match: tableMatch });
  }

  // Add paragraph blocks that are NOT inside a table
  PARAGRAPH_RE.lastIndex = 0;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = PARAGRAPH_RE.exec(xml)) !== null) {
    const pStart = pMatch.index;
    const insideTable = tableRanges.some((r) => pStart >= r.start && pStart < r.end);
    if (!insideTable) {
      blocks.push({ kind: "paragraph", index: pMatch.index, match: pMatch });
    }
  }

  // Sort by document order
  blocks.sort((a, b) => a.index - b.index);

  // Process each block
  for (const block of blocks) {
    if (block.kind === "table") {
      const tableEl = parseTable(block.match[0]);
      if (tableEl) {
        elements.push(tableEl);
      }
    } else {
      const paraEl = parseParagraph(block.match[0]);
      if (paraEl) {
        elements.push(paraEl);
      }
    }
  }

  return elements;
}

// ── Paragraph Parsing ───────────────────────────────────────────

/**
 * Parse a single <w:p> block into an UnstructuredElement.
 * Returns null for empty paragraphs.
 */
function parseParagraph(pXml: string): UnstructuredElement | null {
  const text = extractText(pXml);
  if (!text.trim()) return null;

  // Detect style
  const styleMatch = PSTYLE_RE.exec(pXml);
  const styleName = styleMatch?.[1] ?? "";

  // Detect list
  const isList = NUMPR_RE.test(pXml);

  // Determine element type
  const elementType = classifyParagraph(styleName, isList);

  const element: UnstructuredElement = {
    type: elementType,
    text: text.trim(),
  };

  // Add metadata for headings (level info)
  if (styleName) {
    element.metadata = { style: styleName };
  }

  return element;
}

/**
 * Classify a paragraph based on its style name and list status.
 */
function classifyParagraph(styleName: string, isList: boolean): string {
  if (HEADING1_RE.test(styleName) || HEADING2_RE.test(styleName)) {
    return "Title";
  }
  if (HEADING_OTHER_RE.test(styleName)) {
    return "Header";
  }
  if (isList) {
    return "ListItem";
  }
  return "NarrativeText";
}

/**
 * Extract all text content from a paragraph/cell XML fragment.
 * Handles <w:t>, <w:tab/>, and <w:br/> elements.
 */
function extractText(xml: string): string {
  // Replace tabs and breaks with appropriate characters before text extraction
  let processed = xml.replace(TAB_RE, "\t");
  processed = processed.replace(BR_RE, "\n");

  const parts: string[] = [];
  TEXT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TEXT_RE.exec(processed)) !== null) {
    const captured = m[1];
    if (captured !== undefined) {
      parts.push(decodeXmlEntities(captured));
    }
  }

  return parts.join("");
}

// ── Table Parsing ───────────────────────────────────────────────

/**
 * Parse a <w:tbl> block into a Table element.
 * Cells are joined by " | ", rows by newline.
 * Returns null if the table has no text content.
 */
function parseTable(tblXml: string): UnstructuredElement | null {
  const rows: string[] = [];

  ROW_RE.lastIndex = 0;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = ROW_RE.exec(tblXml)) !== null) {
    const rowContent = rowMatch[1];
    if (rowContent === undefined) continue;

    const cells: string[] = [];
    CELL_RE.lastIndex = 0;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = CELL_RE.exec(rowContent)) !== null) {
      const cellContent = cellMatch[1];
      if (cellContent === undefined) continue;

      // A cell can contain multiple paragraphs; join with space
      const cellTexts: string[] = [];
      PARAGRAPH_RE.lastIndex = 0;
      let cellParagraph: RegExpExecArray | null;
      while ((cellParagraph = PARAGRAPH_RE.exec(cellContent)) !== null) {
        const t = extractText(cellParagraph[0]);
        if (t.trim()) {
          cellTexts.push(t.trim());
        }
      }

      cells.push(cellTexts.join(" "));
    }

    // Only add non-empty rows
    const rowText = cells.join(" | ");
    if (rowText.trim()) {
      rows.push(rowText);
    }
  }

  if (rows.length === 0) return null;

  return {
    type: "Table",
    text: rows.join("\n"),
    metadata: {
      rowCount: rows.length,
    },
  };
}

// ── Utilities ───────────────────────────────────────────────────

/** Decode standard XML character entities. */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex as string, 16)));
}

/** Summarize element type counts for logging. */
function summarizeTypes(elements: UnstructuredElement[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const el of elements) {
    counts[el.type] = (counts[el.type] ?? 0) + 1;
  }
  return counts;
}
