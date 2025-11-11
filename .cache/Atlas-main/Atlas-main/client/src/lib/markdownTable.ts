type TableAlignment = 'left' | 'center' | 'right';

export interface MarkdownTableParseResult {
  headers: string[];
  alignments: TableAlignment[];
  rows: string[][];
  nextIndex: number;
}

const TABLE_ROW_REGEX = /^\s*\|?.*\|.*\|?\s*$/;
const TABLE_DIVIDER_REGEX = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

const normalizeCells = (line: string): string[] => {
  const trimmed = line.trim();
  const withoutOuterPipes = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return withoutOuterPipes.split('|').map(cell => cell.trim());
};

const parseAlignment = (cell: string): TableAlignment => {
  const trimmed = cell.trim();
  const startsWithColon = trimmed.startsWith(':');
  const endsWithColon = trimmed.endsWith(':');
  if (startsWithColon && endsWithColon) {
    return 'center';
  }
  if (endsWithColon) {
    return 'right';
  }
  return 'left';
};

export function looksLikeTableRow(line: string): boolean {
  if (!line.trim()) {
    return false;
  }
  if (!TABLE_ROW_REGEX.test(line)) {
    return false;
  }
  const cells = normalizeCells(line);
  return cells.length > 1;
}

export function looksLikeTableDivider(line: string): boolean {
  if (!line.trim()) {
    return false;
  }
  if (!TABLE_DIVIDER_REGEX.test(line)) {
    return false;
  }
  return true;
}

export function parseMarkdownTable(lines: string[], startIndex: number): MarkdownTableParseResult | null {
  if (startIndex >= lines.length) {
    return null;
  }

  const headerLine = lines[startIndex];
  if (!looksLikeTableRow(headerLine)) {
    return null;
  }

  const dividerIndex = startIndex + 1;
  if (dividerIndex >= lines.length) {
    return null;
  }
  const dividerLine = lines[dividerIndex];
  if (!looksLikeTableDivider(dividerLine)) {
    return null;
  }

  const headers = normalizeCells(headerLine);
  const dividerCells = normalizeCells(dividerLine);
  const alignments = headers.map((_, index) => parseAlignment(dividerCells[index] ?? dividerCells[dividerCells.length - 1] ?? ''));

  const rows: string[][] = [];
  let currentIndex = dividerIndex + 1;
  while (currentIndex < lines.length) {
    const potentialRow = lines[currentIndex];
    if (!looksLikeTableRow(potentialRow)) {
      break;
    }
    const rowCells = normalizeCells(potentialRow);
    // Allow shorter rows by padding with empty strings
    if (rowCells.length < headers.length) {
      rowCells.push(...Array(headers.length - rowCells.length).fill(''));
    }
    rows.push(rowCells);
    currentIndex += 1;
  }

  return {
    headers,
    alignments,
    rows,
    nextIndex: currentIndex,
  };
}
