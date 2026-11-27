import { describe, expect, test } from 'bun:test';
import { computeYDomain, placeholderSeries, plottableLines } from './metricsChart';

const lines = (values: Record<string, number>) =>
  Object.entries(values).map(([name, value]) => ({ name, value }));

describe('computeYDomain', () => {
  const expectValid = ([lower, upper]: [number, number]) => {
    expect(Number.isFinite(lower)).toBe(true);
    expect(Number.isFinite(upper)).toBe(true);
    expect(lower).toBeGreaterThanOrEqual(0);
    expect(upper).toBeGreaterThan(lower);
  };

  test('pads the range of the values', () => {
    const [lower, upper] = computeYDomain([100, 200]);
    expect(lower).toBeCloseTo(85);
    expect(upper).toBeCloseTo(215);
  });

  test('pads a single value', () => {
    const domain = computeYDomain([512]);
    expectValid(domain);
    expect(domain[0]).toBeLessThan(512);
    expect(domain[1]).toBeGreaterThan(512);
  });

  test('never goes below zero', () => {
    expect(computeYDomain([0.1, 10])[0]).toBe(0);
  });

  test.each([
    ['no values', []],
    ['only zeros', [0, 0]],
    ['only non-finite values', [NaN, Infinity, -Infinity, undefined, null]],
    ['only negative values', [-5, -1]],
  ])('returns a valid domain for %s', (_, values) => {
    expectValid(computeYDomain(values));
  });

  test('ignores non-finite values', () => {
    expect(computeYDomain([100, NaN, 200, undefined, Infinity, null])).toEqual(computeYDomain([100, 200]));
  });
});

describe('plottableLines', () => {
  test('drops NaN and infinite values and keeps the rest', () => {
    const input = [
      { name: 'Current Request', value: 256, color: 'a' },
      { name: 'Current Limit', value: NaN, color: 'b' },
      { name: 'Recommended Request', value: Infinity, color: 'c' },
      { name: 'Recommended Limit', value: 0.5, color: 'd' },
    ];
    expect(plottableLines(input).map((l) => l.name)).toEqual(['Current Request', 'Recommended Limit']);
  });
});

describe('placeholderSeries', () => {
  test('carries each line as a constant series over evenly spaced timestamps', () => {
    const data = placeholderSeries(lines({ 'Current Request': 256, 'Current Limit': 512 }), 10_000);
    expect(data).toHaveLength(12);
    expect(data[0].timestamp).toBe(10_000 - 11 * 300);
    expect(data[11].timestamp).toBe(10_000);
    for (const point of data) {
      expect(point['Current Request']).toBe(256);
      expect(point['Current Limit']).toBe(512);
    }
  });

  test('works with a single line', () => {
    const data = placeholderSeries(lines({ 'Recommended Request': 0.12 }), 1_000, 3, 60);
    expect(data).toEqual([
      { timestamp: 880, 'Recommended Request': 0.12 },
      { timestamp: 940, 'Recommended Request': 0.12 },
      { timestamp: 1_000, 'Recommended Request': 0.12 },
    ]);
  });

  test('returns timestamps only when there are no lines', () => {
    expect(placeholderSeries([], 1_000, 2, 60)).toEqual([{ timestamp: 940 }, { timestamp: 1_000 }]);
  });

  test('a domain computed from the placeholder covers every line', () => {
    const input = lines({ 'Current Request': 120, 'Current Limit': 512, 'Recommended Request': 358 });
    const data = placeholderSeries(input, 1_000);
    const [lower, upper] = computeYDomain(data.flatMap((d) => input.map((l) => d[l.name])));
    for (const line of input) {
      expect(line.value).toBeGreaterThan(lower);
      expect(line.value).toBeLessThan(upper);
    }
  });
});
