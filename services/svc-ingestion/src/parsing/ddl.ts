import type { CodeDdl, DdlColumn } from "@ai-foundry/types";

const RE_CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)\s*;/gi;
const RE_FK = /FOREIGN\s+KEY\s*\([`"']?(\w+)[`"']?\)\s*REFERENCES\s+[`"']?(\w+)[`"']?\s*\([`"']?(\w+)[`"']?\)/gi;
const RE_PK_CONSTRAINT = /PRIMARY\s+KEY\s*\(([^)]+)\)/gi;

export function parseDdl(source: string, filename: string): CodeDdl[] {
  const tables: CodeDdl[] = [];

  RE_CREATE_TABLE.lastIndex = 0;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = RE_CREATE_TABLE.exec(source)) !== null) {
    const tableName = tableMatch[1] ?? "";
    const body = tableMatch[2] ?? "";

    const columns: DdlColumn[] = [];
    const primaryKey: string[] = [];
    const foreignKeys: Array<{ column: string; refTable: string; refColumn: string }> = [];

    RE_FK.lastIndex = 0;
    let fkMatch: RegExpExecArray | null;
    while ((fkMatch = RE_FK.exec(body)) !== null) {
      foreignKeys.push({
        column: fkMatch[1] ?? "",
        refTable: fkMatch[2] ?? "",
        refColumn: fkMatch[3] ?? "",
      });
    }

    RE_PK_CONSTRAINT.lastIndex = 0;
    let pkMatch: RegExpExecArray | null;
    while ((pkMatch = RE_PK_CONSTRAINT.exec(body)) !== null) {
      const cols = (pkMatch[1] ?? "").split(",").map((c) =>
        c.trim().replace(/[`"']/g, ""),
      );
      primaryKey.push(...cols);
    }

    const lines = body.split(",");
    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (/^\s*(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|INDEX|KEY|CONSTRAINT)\b/i.test(line)) {
        continue;
      }

      const col = parseColumnDef(line, primaryKey);
      if (col) {
        columns.push(col);
        if (col.isPrimaryKey && !primaryKey.includes(col.name)) {
          primaryKey.push(col.name);
        }
      }
    }

    if (columns.length > 0) {
      tables.push({ tableName, columns, primaryKey, foreignKeys, sourceFile: filename });
    }
  }

  return tables;
}

function parseColumnDef(line: string, pkColumns: string[]): DdlColumn | null {
  const match = /^[`"']?(\w+)[`"']?\s+(\w+(?:\(\d+(?:\s*,\s*\d+)?\))?)\s*(.*)/i.exec(line);
  if (!match) return null;

  const name = match[1] ?? "";
  const type = match[2] ?? "";
  const rest = match[3] ?? "";

  if (/^(PRIMARY|FOREIGN|UNIQUE|INDEX|KEY|CONSTRAINT|CHECK)$/i.test(name)) {
    return null;
  }

  const nullable = !/NOT\s+NULL/i.test(rest);
  const isPrimaryKey = /PRIMARY\s+KEY/i.test(rest) || pkColumns.includes(name);

  let defaultValue: string | undefined;
  const defaultMatch = /DEFAULT\s+(\S+)/i.exec(rest);
  if (defaultMatch) {
    defaultValue = defaultMatch[1]?.replace(/['"]/g, "");
  }

  let comment: string | undefined;
  const commentMatch = /COMMENT\s+'([^']+)'/i.exec(rest);
  if (commentMatch) {
    comment = commentMatch[1];
  }

  return { name, type, nullable, isPrimaryKey, defaultValue, comment };
}
