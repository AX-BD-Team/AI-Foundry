/**
 * MyBatis XML Mapper regex-based parser.
 * Parses MyBatis 3 XML mapper files and extracts namespace, resultMaps, queries, and table names.
 * Phase 2-B: Enables table coverage from MyBatis XML (no .sql files in LPON project).
 */

// ── Types ────────────────────────────────────────────────────────

export interface MyBatisResultColumn {
  column: string;
  property: string;
  javaType?: string;
  jdbcType?: string;
  isPrimaryKey: boolean;
}

export interface MyBatisResultMap {
  id: string;
  type: string;
  typeName: string;
  columns: MyBatisResultColumn[];
}

export interface MyBatisQuery {
  id: string;
  queryType: "select" | "insert" | "update" | "delete";
  tables: string[];
  parameterType?: string;
  resultMapRef?: string;
  columnNames: string[];
}

export interface CodeMapper {
  namespace: string;
  mapperName: string;
  resultMaps: MyBatisResultMap[];
  queries: MyBatisQuery[];
  tables: string[];
  sourceFile: string;
}

// ── Regex patterns ───────────────────────────────────────────────

const RE_MAPPER_NS = /<mapper\s+namespace\s*=\s*["']([^"']+)["']/;
const RE_RESULT_MAP = /<resultMap\s+id\s*=\s*["']([^"']+)["']\s+type\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/resultMap>/g;
const RE_RESULT_COL = /<(id|result)\s+([^/>]+)\/?\s*>/g;
const RE_QUERY = /<(select|insert|update|delete)\s+id\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>/g;
const RE_FROM_TABLE = /\bFROM\s+([`"]?\w+[`"]?)/gi;
const RE_INTO_TABLE = /\bINTO\s+([`"]?\w+[`"]?)/gi;
const RE_UPDATE_TABLE = /\bUPDATE\s+([`"]?\w+[`"]?)/gi;
const RE_JOIN_TABLE = /\bJOIN\s+([`"]?\w+[`"]?)/gi;
const RE_SELECT_COLS = /\bSELECT\s+([\s\S]+?)\bFROM\b/gi;
const RE_INSERT_COLS = /\(\s*([\w\s,`"]+)\s*\)\s*VALUES/gi;

// Dynamic SQL tags to strip (keep inner content)
const RE_DYNAMIC_TAGS = /<\/?(if|choose|when|otherwise|foreach|where|set|trim|bind)\b[^>]*>/g;

// ── Helpers ──────────────────────────────────────────────────────

function getAttr(attrs: string, name: string): string | undefined {
  const re = new RegExp(name + '\\s*=\\s*["\']([^"\']+)["\']');
  const m = re.exec(attrs);
  return m?.[1];
}

function stripCdata(sql: string): string {
  return sql.replace(/<!\[CDATA\[/g, "").replace(/]]>/g, "");
}

function stripDynamicTags(sql: string): string {
  return sql.replace(RE_DYNAMIC_TAGS, "");
}

function cleanSql(raw: string): string {
  return stripDynamicTags(stripCdata(raw));
}

function extractTables(sql: string): string[] {
  const tables = new Set<string>();
  const cleaned = cleanSql(sql);

  for (const re of [RE_FROM_TABLE, RE_INTO_TABLE, RE_UPDATE_TABLE, RE_JOIN_TABLE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
      const raw = m[1];
      if (raw) {
        tables.add(raw.replace(/[`"]/g, ""));
      }
    }
  }

  return [...tables];
}

function extractColumnNames(sql: string, queryType: string): string[] {
  const cleaned = cleanSql(sql);
  const cols: string[] = [];

  if (queryType === "select") {
    RE_SELECT_COLS.lastIndex = 0;
    const m = RE_SELECT_COLS.exec(cleaned);
    if (m?.[1]) {
      const colList = m[1];
      // Skip if SELECT *
      if (!/^\s*\*\s*$/.test(colList)) {
        for (const part of colList.split(",")) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          // Remove alias: "col AS alias" -> "col", "t.col alias" -> "col"
          const asMatch = /^(.+?)\s+(?:AS\s+)?(\w+)$/i.exec(trimmed);
          const name = asMatch ? (asMatch[1] ?? trimmed).trim() : trimmed;
          // Remove table prefix: "t.col" -> "col"
          const dotIdx = name.lastIndexOf(".");
          const colName = dotIdx >= 0 ? name.slice(dotIdx + 1) : name;
          if (colName && /^\w+$/.test(colName)) {
            cols.push(colName);
          }
        }
      }
    }
  } else if (queryType === "insert") {
    RE_INSERT_COLS.lastIndex = 0;
    const m = RE_INSERT_COLS.exec(cleaned);
    if (m?.[1]) {
      for (const part of m[1].split(",")) {
        const trimmed = part.trim().replace(/[`"]/g, "");
        if (trimmed && /^\w+$/.test(trimmed)) {
          cols.push(trimmed);
        }
      }
    }
  }

  return cols;
}

function shortName(fullClassName: string): string {
  const parts = fullClassName.split(".");
  return parts[parts.length - 1] ?? fullClassName;
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Detect whether content is a MyBatis 3 mapper XML.
 */
export function isMyBatisMapper(content: string): boolean {
  if (content.includes("mybatis.org/dtd/mybatis-3-mapper.dtd")) return true;
  if (content.includes("<mapper") && content.includes("namespace=")) return true;
  return false;
}

/**
 * Parse a MyBatis mapper XML and extract structured metadata.
 * Returns null if namespace is not found.
 */
export function parseMyBatisMapper(content: string, sourceFile: string): CodeMapper | null {
  // Extract namespace
  const nsMatch = RE_MAPPER_NS.exec(content);
  if (!nsMatch?.[1]) return null;

  const namespace = nsMatch[1];
  const mapperName = shortName(namespace);

  // Parse resultMaps
  const resultMaps: MyBatisResultMap[] = [];
  RE_RESULT_MAP.lastIndex = 0;
  let rmMatch: RegExpExecArray | null;
  while ((rmMatch = RE_RESULT_MAP.exec(content)) !== null) {
    const id = rmMatch[1] ?? "";
    const type = rmMatch[2] ?? "";
    const body = rmMatch[3] ?? "";

    const columns: MyBatisResultColumn[] = [];
    RE_RESULT_COL.lastIndex = 0;
    let colMatch: RegExpExecArray | null;
    while ((colMatch = RE_RESULT_COL.exec(body)) !== null) {
      const tagName = colMatch[1] ?? "";
      const attrs = colMatch[2] ?? "";

      const column = getAttr(attrs, "column");
      const property = getAttr(attrs, "property");
      if (column && property) {
        const col: MyBatisResultColumn = {
          column,
          property,
          isPrimaryKey: tagName === "id",
        };
        const javaType = getAttr(attrs, "javaType");
        if (javaType) col.javaType = javaType;
        const jdbcType = getAttr(attrs, "jdbcType");
        if (jdbcType) col.jdbcType = jdbcType;
        columns.push(col);
      }
    }

    resultMaps.push({
      id,
      type,
      typeName: shortName(type),
      columns,
    });
  }

  // Parse queries
  const queries: MyBatisQuery[] = [];
  const allTables = new Set<string>();

  RE_QUERY.lastIndex = 0;
  let qMatch: RegExpExecArray | null;
  while ((qMatch = RE_QUERY.exec(content)) !== null) {
    const queryType = (qMatch[1] ?? "select") as MyBatisQuery["queryType"];
    const id = qMatch[2] ?? "";
    const attrs = qMatch[3] ?? "";
    const sqlBody = qMatch[4] ?? "";

    const tables = extractTables(sqlBody);
    for (const t of tables) {
      allTables.add(t);
    }

    const columnNames = extractColumnNames(sqlBody, queryType);

    const query: MyBatisQuery = {
      id,
      queryType,
      tables,
      columnNames,
    };

    const parameterType = getAttr(attrs, "parameterType");
    if (parameterType) {
      query.parameterType = parameterType;
    }

    const resultMapRef = getAttr(attrs, "resultMap");
    if (resultMapRef) {
      query.resultMapRef = resultMapRef;
    }

    queries.push(query);
  }

  return {
    namespace,
    mapperName,
    resultMaps,
    queries,
    tables: [...allTables],
    sourceFile,
  };
}
