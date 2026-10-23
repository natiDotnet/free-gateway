import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from './csv.ts';

/** RFC 4180 escaping — protects column structure, nothing more. */
describe('csvCell', () => {
  it('passes clean text through unchanged', () => {
    assert.equal(csvCell('PAY-1001'), 'PAY-1001');
    assert.equal(csvCell(1250), '1250');
    assert.equal(csvCell(0), '0');
  });

  it('renders null/undefined as an empty cell', () => {
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(undefined), '');
  });

  it('wraps values containing commas', () => {
    assert.equal(csvCell('a,b'), '"a,b"');
  });

  it('doubles embedded quotes and wraps', () => {
    assert.equal(csvCell('he said "stop"'), '"he said ""stop"""');
  });

  it('wraps values containing CRLF and LF', () => {
    assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
    assert.equal(csvCell('line1\r\nline2'), '"line1\r\nline2"');
    assert.equal(csvCell('line1\rline2'), '"line1\rline2"');
  });

  it('cannot be broken by a pure quote/comma mix', () => {
    const cell = csvCell('"=SUM(1,2)"');
    const row = csvCell('payload') + ',' + cell + ',' + csvCell('end');
    const cells = parseRfc4180Row(row);
    assert.deepEqual(cells, ['payload', '"=SUM(1,2)"', 'end']);
  });
});

/** Minimal RFC 4180 row parser used to prove the round-trip. */
function parseRfc4180Row(row: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (inQuotes) {
      if (char === '"' && row[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else if (char === '"' && current === '') {
      inQuotes = true;
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
