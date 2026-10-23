import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateTime,
  formatDecimal,
  formatInt,
  formatMoney,
  formatUtcDay,
  maskDestinationUrl,
} from './ui.ts';

/**
 * Shared number/date formatters. These are locale-aware by design (each
 * viewer's locale is preserved), so assertions pin the en-US environment used
 * by CI/the dev container.
 */
describe('formatInt', () => {
  it('groups thousands', () => {
    assert.equal(formatInt(1000), '1,000');
    assert.equal(formatInt(0), '0');
  });
});

describe('formatDecimal', () => {
  it('keeps at most two fraction digits', () => {
    assert.equal(formatDecimal(1234.567), '1,234.57');
    assert.equal(formatDecimal(1250.5), '1,250.5');
    assert.equal(formatDecimal(7), '7');
  });
});

describe('formatMoney', () => {
  it('appends the currency without conversion', () => {
    assert.equal(formatMoney(199.99, 'ETB'), '199.99 ETB');
    // Per-currency policy: same digits, different currency strings.
    assert.equal(formatMoney(199.99, 'USD'), '199.99 USD');
  });
});

describe('formatDateTime', () => {
  it('renders invalid input as an em dash instead of "Invalid Date"', () => {
    assert.equal(formatDateTime('not-a-date'), '—');
    assert.equal(formatDateTime(''), '—');
  });

  it('renders a valid ISO timestamp with local human formatting', () => {
    const output = formatDateTime('2026-10-23T09:30:00.000Z');
    assert.match(output, /2026/);
    // Time + meridiem/24h marker: an actual clock render, not a raw ISO passthrough.
    assert.match(output, /:\d\d/);
    assert.match(output, /AM|PM|\d{4}-\d{2}-\d{2}/);
  });
});

describe('formatUtcDay', () => {
  it('shows the date part in UTC, independent of server time zone', () => {
    // 23 Oct 23:30 UTC — in +03:00 (server tz) it would already be the 24th.
    assert.equal(formatUtcDay('2026-10-23T23:30:00.000Z'), 'Oct 23, 2026');
  });

  it('renders invalid input as an em dash', () => {
    assert.equal(formatUtcDay('garbage'), '—');
  });
});

describe('maskDestinationUrl', () => {
  it('keeps scheme, host and path but hides query strings and body', () => {
    assert.equal(
      maskDestinationUrl('https://merchant.example.com/api/callback?secret=abc'),
      'https://merchant.example.com/api/callback'
    );
  });

  it('truncates very long paths with an ellipsis', () => {
    const result = maskDestinationUrl(
      'https://host.example.com/' + 'x'.repeat(80)
    );
    assert.match(result, /^https:\/\/host\.example\.com\/x{1,40}…$/);
  });

  it('flags unparsable destinations', () => {
    assert.equal(maskDestinationUrl('..//nope'), 'invalid URL');
  });
});
