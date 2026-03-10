import { useMemo } from 'react';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

// ─── Block types ─────────────────────────────────────────────

interface MarkdownLine {
  kind: 'line';
  type: 'h1' | 'h2' | 'h3' | 'li' | 'ol' | 'hr' | 'p' | 'blockquote';
  text: string;
}

interface MarkdownTable {
  kind: 'table';
  headers: string[];
  alignments: Array<'left' | 'center' | 'right'>;
  rows: string[][];
}

type MarkdownBlock = MarkdownLine | MarkdownTable;

// ─── Parsing ──────────────────────────────────────────────────

/** Split a table row `| a | b | c |` into cells `["a", "b", "c"]` */
function splitTableCells(line: string): string[] {
  const trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.replace(/\\\|/g, '|').trim());
}

/** Detect alignment from separator cell: `:---:` → center, `---:` → right */
function parseAlignment(cell: string): 'left' | 'center' | 'right' {
  const t = cell.trim();
  if (t.startsWith(':') && t.endsWith(':')) return 'center';
  if (t.endsWith(':')) return 'right';
  return 'left';
}

/** Check if a line is a table separator: `|---|---|` */
function isTableSeparator(line: string): boolean {
  return /^\|?[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|?$/.test(line.trim());
}

function parseBlocks(content: string): MarkdownBlock[] {
  const rawLines = content.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i]!;

    // Skip empty lines
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Table detection: current line starts with `|` and next line is separator
    if (line.trimStart().startsWith('|') && i + 1 < rawLines.length && isTableSeparator(rawLines[i + 1]!)) {
      const headers = splitTableCells(line);
      const alignments = splitTableCells(rawLines[i + 1]!).map(parseAlignment);
      const rows: string[][] = [];
      i += 2; // skip header + separator

      while (i < rawLines.length && rawLines[i]!.trimStart().startsWith('|')) {
        rows.push(splitTableCells(rawLines[i]!));
        i++;
      }

      blocks.push({ kind: 'table', headers, alignments, rows });
      continue;
    }

    // Regular line parsing
    blocks.push({ kind: 'line', ...parseSingleLine(line) });
    i++;
  }

  return blocks;
}

function parseSingleLine(line: string): { type: MarkdownLine['type']; text: string } {
  if (line.startsWith('### ')) return { type: 'h3', text: line.slice(4) };
  if (line.startsWith('## ')) return { type: 'h2', text: line.slice(3) };
  if (line.startsWith('# ')) return { type: 'h1', text: line.slice(2) };
  if (/^---+$/.test(line.trim())) return { type: 'hr', text: '' };
  if (line.startsWith('> ')) return { type: 'blockquote', text: line.slice(2) };
  if (line.startsWith('- ')) return { type: 'li', text: line.slice(2) };
  const olMatch = /^(\d+)\.\s+(.+)/.exec(line);
  if (olMatch?.[1] && olMatch[2]) return { type: 'ol', text: `${olMatch[1]}|${olMatch[2]}` };
  return { type: 'p', text: line };
}

// ─── Inline rendering ─────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--border)' }}>
          {match[3]}
        </code>
      );
    } else if (match[4] && match[5]) {
      parts.push(
        <a key={key++} href={match[5]} className="underline" style={{ color: 'var(--primary)' }}>
          {match[4]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

// ─── Component ────────────────────────────────────────────────

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        if (block.kind === 'table') {
          return (
            <div key={i} className="overflow-x-auto my-2">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    {block.headers.map((h, j) => (
                      <th
                        key={j}
                        className="border px-2 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: 'var(--surface, var(--muted))',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)',
                          textAlign: block.alignments[j] ?? 'left',
                        }}
                      >
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, cj) => (
                        <td
                          key={cj}
                          className="border px-2 py-1 text-xs"
                          style={{
                            borderColor: 'var(--border)',
                            color: 'var(--text-primary)',
                            textAlign: block.alignments[cj] ?? 'left',
                          }}
                        >
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        const line = block;
        const inline = renderInline(line.text);

        switch (line.type) {
          case 'h1':
            return <h3 key={i} className="text-base font-bold mt-3 mb-1.5" style={{ color: 'var(--text-primary)' }}>{inline}</h3>;
          case 'h2':
            return <h4 key={i} className="text-sm font-semibold mt-2.5 mb-1" style={{ color: 'var(--primary)' }}>{inline}</h4>;
          case 'h3':
            return <h5 key={i} className="text-sm font-medium mt-2 mb-1" style={{ color: 'var(--text-secondary)' }}>{inline}</h5>;
          case 'hr':
            return <hr key={i} className="my-2 border-t" style={{ borderColor: 'var(--border)' }} />;
          case 'blockquote':
            return (
              <blockquote key={i} className="border-l-2 pl-3 my-1 text-sm italic" style={{ borderColor: 'var(--primary)', color: 'var(--text-secondary)' }}>
                {inline}
              </blockquote>
            );
          case 'li':
            return (
              <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--text-secondary)' }} />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{inline}</span>
              </div>
            );
          case 'ol': {
            const pipeIdx = line.text.indexOf('|');
            const num = pipeIdx > 0 ? line.text.slice(0, pipeIdx) : String(i + 1);
            const olText = pipeIdx > 0 ? line.text.slice(pipeIdx + 1) : line.text;
            const olInline = renderInline(olText);
            return (
              <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
                <span className="text-sm font-medium shrink-0" style={{ color: 'var(--text-secondary)', minWidth: '1.25rem' }}>{num}.</span>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{olInline}</span>
              </div>
            );
          }
          default:
            return <p key={i} className="text-sm my-0.5 leading-relaxed" style={{ color: 'var(--text-primary)' }}>{inline}</p>;
        }
      })}
    </div>
  );
}
