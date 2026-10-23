/**
 * Pure metric math shared across server pages. No React, no DB — safe to
 * unit-test with `node --test`.
 */

/**
 * Human-friendly period-over-period delta.
 *
 * Returns e.g. "+12.5% vs prior period". When `previous` is 0 the comparison
 * is undefined rather than a fake percentage: `No prior activity` when the
 * prior window recorded nothing, `No change` when both windows are empty.
 * A leading U+2212 (minus) is used for declines so the value is legible next
 * to tabular figures.
 */
export function percentageChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? 'No change' : 'No prior activity';
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(Math.abs(change) * 10) / 10;
  return `${change > 0 ? '+' : change < 0 ? '−' : ''}${rounded}% vs prior period`;
}
