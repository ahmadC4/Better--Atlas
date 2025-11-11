import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMarkdownTable, looksLikeTableRow, looksLikeTableDivider } from '../client/src/lib/markdownTable';

test('parseMarkdownTable parses simple markdown table', () => {
  const lines = [
    '| Reason | Implications |',
    '| --- | --- |',
    '| Broken layout | Poor readability |',
    '| Raw markdown | Distracting UI |',
    '',
  ];

  const result = parseMarkdownTable(lines, 0);
  assert.ok(result, 'expected table to be parsed');
  assert.deepEqual(result?.headers, ['Reason', 'Implications']);
  assert.deepEqual(result?.alignments, ['left', 'left']);
  assert.equal(result?.nextIndex, 4);
  assert.deepEqual(result?.rows, [
    ['Broken layout', 'Poor readability'],
    ['Raw markdown', 'Distracting UI'],
  ]);
});

test('parseMarkdownTable respects alignment indicators', () => {
  const lines = [
    'Feature | Status | Notes',
    ':--- | :---: | ---:',
    'Tables | ✅ | Align columns',
  ];

  const result = parseMarkdownTable(lines, 0);
  assert.ok(result, 'expected aligned table to parse');
  assert.deepEqual(result?.alignments, ['left', 'center', 'right']);
  assert.equal(result?.rows.length, 1);
});

test('looksLikeTableRow and looksLikeTableDivider identify valid lines', () => {
  assert.equal(looksLikeTableRow('| Heading | Value |'), true);
  assert.equal(looksLikeTableRow('Not a table'), false);
  assert.equal(looksLikeTableDivider('| --- | --- |'), true);
  assert.equal(looksLikeTableDivider('| text | not divider |'), false);
});

test('parseMarkdownTable returns null when structure is incomplete', () => {
  const lines = ['| Just header |', 'No divider'];
  const result = parseMarkdownTable(lines, 0);
  assert.equal(result, null);
});
