import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { percentageChange } from './metric.ts';

/**
 * Period-over-period comparison shown on the analytics page. When the prior
 * window is empty the function must refuse to invent a percentage (markup
 * `No prior activity` / `No change`) instead of dividing by zero.
 */
describe('percentageChange', () => {
  it('marks growth with a plus sign', () => {
    assert.equal(percentageChange(110, 100), '+10% vs prior period');
  });

  it('marks declines with U+2212 and keeps magnitude', () => {
    const result = percentageChange(90, 100);
    assert.match(result, /^−10% vs prior period$/);
  });

  it('rounds to one decimal place', () => {
    assert.equal(percentageChange(115.4, 100), '+15.4% vs prior period');
    assert.equal(percentageChange(16, 3), '+433.3% vs prior period');
  });

  it(' refuses division by zero both ways empty', () => {
    assert.equal(percentageChange(0, 0), 'No change');
  });

  it('reports no prior activity rather than a fake percentage', () => {
    assert.equal(percentageChange(50, 0), 'No prior activity');
  });

  it('reports flat periods when both non-zero equal', () => {
    assert.equal(percentageChange(5, 5), '0% vs prior period');
  });
});
