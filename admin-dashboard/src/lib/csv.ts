/**
 * RFC 4180 CSV cell escape, shared by every export endpoint.
 *
 * Cells containing quotes, commas, CR or LF are wrapped in double quotes and
 * embedded quotes are doubled, so values such as `=SUM(...)` cannot break the
 * column structure (pure injection resistance, not a spreadsheet policy).
 */
export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
