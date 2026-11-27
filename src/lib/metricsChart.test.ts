import { describe, expect, test } from 'bun:test';
import {
  collectYValues,
  computeYDomain,
  describeForecast,
  forecastSeries,
  formatChartValue,
  hasPercentileBounds,
  observedUsage,
  percentileBounds,
  placeholderSeries,
  plottableLines,
  visibleSeriesKeys,
  withForecast,
} from './metricsChart';

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

describe('computeYDomain with huge values', () => {
  test('stays finite near Number.MAX_VALUE', () => {
    const [lower, upper] = computeYDomain([0, Number.MAX_VALUE]);
    expect(Number.isFinite(upper)).toBe(true);
    expect(upper).toBeGreaterThan(lower);
  });
});

describe('observedUsage', () => {
  test.each([
    ['250m', 0.25],
    ['1', 1],
    ['1.5', 1.5],
    ['2k', 2000],
    ['500u', 0.0005],
    ['100n', 1e-7],
    ['0', 0],
  ])('parses CPU %s into cores', (value, cores) => {
    expect(observedUsage(value, 'cpu')).toBeCloseTo(cores, 12);
  });

  test.each([
    ['512Mi', 512],
    ['1Gi', 1024],
    ['375809638', 375809638 / 2 ** 20],
    ['500M', 5e8 / 2 ** 20],
    ['0', 0],
  ])('parses memory %s into MiB', (value, mib) => {
    expect(observedUsage(value, 'memory')).toBeCloseTo(mib, 9);
  });

  test.each([undefined, null, '', '-', 'abc', '12Q', '-1', '-250m', 'NaN', 'Infinity'])(
    'returns undefined for %p',
    (value) => {
      expect(observedUsage(value, 'cpu')).toBeUndefined();
      expect(observedUsage(value, 'memory')).toBeUndefined();
    },
  );

  test('keeps huge values finite', () => {
    expect(observedUsage('8Ei', 'memory')).toBe(8 * 2 ** 40);
    expect(Number.isFinite(observedUsage('1E', 'cpu'))).toBe(true);
  });
});

describe('percentileBounds', () => {
  const container = { p95CPU: '120m', p99CPU: '300m', p95Memory: '256Mi', p99Memory: '1Gi' };

  test('uses the CPU fields in cores', () => {
    expect(percentileBounds(container, 'cpu')).toEqual({ p95: 0.12, p99: 0.3 });
  });

  test('uses the memory fields in MiB', () => {
    expect(percentileBounds(container, 'memory')).toEqual({ p95: 256, p99: 1024 });
  });

  test('omits missing and malformed values instead of producing NaN', () => {
    const bounds = percentileBounds({ p95CPU: 'abc', p99CPU: undefined, p95Memory: null, p99Memory: '1Gi' }, 'cpu');
    expect(bounds).toEqual({});
    expect(hasPercentileBounds(bounds)).toBe(false);
    expect(percentileBounds({ p95Memory: null, p99Memory: '1Gi' }, 'memory')).toEqual({ p99: 1024 });
  });

  test('keeps zero bounds', () => {
    const bounds = percentileBounds({ p95CPU: '0', p99CPU: '0m' }, 'cpu');
    expect(bounds).toEqual({ p95: 0, p99: 0 });
    expect(hasPercentileBounds(bounds)).toBe(true);
  });

  test('handles a container without any field', () => {
    expect(percentileBounds({}, 'memory')).toEqual({});
    expect(hasPercentileBounds(undefined)).toBe(false);
  });
});

describe('collectYValues', () => {
  test('collects numbers and both ends of ranges for the given keys only', () => {
    const rows = [
      { timestamp: 1, usage: 1, forecastRange: [0.5, 2], other: 99 },
      { timestamp: 2, usage: null, forecast: 3, forecastRange: undefined },
    ];
    expect(collectYValues(rows, ['usage', 'forecast', 'forecastRange']).sort()).toEqual([0.5, 1, 2, 3]);
  });
});

describe('visibleSeriesKeys', () => {
  const base = { podNames: [], lineNames: ['Current Limit'], forecast: false, hidden: new Set<string>() };

  test('covers usage and lines without a forecast', () => {
    expect(visibleSeriesKeys(base)).toEqual(['usage', 'Current Limit']);
  });

  test('adds the forecast and its interval when the forecast is drawn', () => {
    expect(visibleSeriesKeys({ ...base, forecast: true })).toEqual([
      'usage',
      'Current Limit',
      'forecast',
      'forecastRange',
    ]);
  });

  test('adds the pods in the per-pod view and keeps the forecast', () => {
    expect(visibleSeriesKeys({ ...base, podNames: ['a', 'b'], forecast: true })).toEqual([
      'usage',
      'pod_a',
      'pod_b',
      'Current Limit',
      'forecast',
      'forecastRange',
    ]);
  });

  test('leaves out hidden series', () => {
    const hidden = new Set(['forecastRange', 'pod_a', 'Current Limit']);
    expect(visibleSeriesKeys({ ...base, podNames: ['a', 'b'], forecast: true, hidden })).toEqual([
      'usage',
      'pod_b',
      'forecast',
    ]);
  });
});

describe('forecastSeries', () => {
  const response = {
    history: [
      { timestamp: 900, value: 0.4 },
      { timestamp: 960, value: 0.45 },
    ],
    forecast: [
      { timestamp: 1020, value: 0.5, lower: 0.3, upper: 0.7 },
      { timestamp: 1080, value: 0.55, lower: 0.3, upper: 0.8 },
    ],
  };

  test('starts at the last usage point and continues after it', () => {
    const { rows, nowTimestamp } = forecastSeries(response, { timestamp: 1000, value: 0.49 });
    expect(rows[0]).toEqual({ timestamp: 1000, forecast: 0.49, forecastRange: [0.49, 0.49] });
    expect(nowTimestamp).toBe(1000);
    expect(rows[1].timestamp).toBeGreaterThan(1000);
    expect(rows.map((r) => r.timestamp)).toEqual([1000, 1020, 1080]);
  });

  test('drops forecast points at or before the last usage point', () => {
    const { rows } = forecastSeries(response, { timestamp: 1020, value: 0.5 });
    expect(rows.map((r) => r.timestamp)).toEqual([1020, 1080]);
  });

  test('is empty when every forecast point is before the last usage point', () => {
    expect(forecastSeries(response, { timestamp: 5000, value: 1 })).toEqual({ rows: [] });
  });

  test("falls back to the end of the response's history without usage", () => {
    const { rows, nowTimestamp } = forecastSeries(response);
    expect(nowTimestamp).toBe(960);
    expect(rows[0]).toEqual({ timestamp: 960, forecast: 0.45, forecastRange: [0.45, 0.45] });
  });

  test('draws the forecast alone without usage or history', () => {
    const { rows, nowTimestamp } = forecastSeries({ forecast: response.forecast });
    expect(nowTimestamp).toBeUndefined();
    expect(rows.map((r) => r.timestamp)).toEqual([1020, 1080]);
  });

  test.each([
    ['an empty forecast', { history: response.history, forecast: [] }],
    ['a null forecast', { history: null, forecast: null }],
    ['a missing response', undefined],
    ['a non-array forecast', { forecast: 'nope' }],
  ])('returns no rows for %s', (_, input) => {
    expect(forecastSeries(input as never, { timestamp: 1000, value: 1 })).toEqual({ rows: [] });
  });

  test('skips points with null fields and keeps a point without an interval', () => {
    const { rows } = forecastSeries({
      forecast: [
        { timestamp: null, value: 1, lower: 0, upper: 2 },
        { timestamp: 1100, value: null, lower: 0, upper: 2 },
        { timestamp: 1200, value: NaN },
        { timestamp: 1300, value: 1, lower: null, upper: 2 },
        null,
      ],
    });
    expect(rows).toEqual([{ timestamp: 1300, forecast: 1 }]);
    expect(JSON.stringify(rows)).not.toContain('NaN');
  });

  test('clamps negative values at zero and orders the interval', () => {
    const { rows } = forecastSeries({ forecast: [{ timestamp: 10, value: -0.1, lower: 0.2, upper: -0.5 }] });
    expect(rows).toEqual([{ timestamp: 10, forecast: 0, forecastRange: [0, 0.2] }]);
  });

  test('sorts and de-duplicates timestamps', () => {
    const { rows } = forecastSeries({
      forecast: [
        { timestamp: 30, value: 3, lower: 2, upper: 4 },
        { timestamp: 10, value: 1, lower: 0, upper: 2 },
        { timestamp: 30, value: 5, lower: 4, upper: 6 },
      ],
    });
    expect(rows.map((r) => [r.timestamp, r.forecast])).toEqual([
      [10, 1],
      [30, 5],
    ]);
  });

  test('ignores an anchor that is not a finite point', () => {
    const { nowTimestamp } = forecastSeries(response, { timestamp: NaN, value: 1 });
    expect(nowTimestamp).toBe(960);
  });
});

describe('withForecast', () => {
  const usage = [
    { timestamp: 900, usage: 0.4, pod_a: 0.3, pod_b: 0.5 },
    { timestamp: 1000, usage: 0.49, pod_a: 0.4, pod_b: 0.58 },
  ];
  const { rows: forecast } = forecastSeries(
    { forecast: [{ timestamp: 1000 + 3600, value: 0.6, lower: 0.2, upper: 1.4 }, { timestamp: 1000 + 86400, value: 0.7, lower: 0.1, upper: 2.5 }] },
    { timestamp: 1000, value: 0.49 },
  );

  test('without a forecast returns the original rows and no X domain', () => {
    for (const off of [undefined, []]) {
      const result = withForecast(usage, off);
      expect(result.data).toBe(usage);
      expect(result.xDomain).toBeUndefined();
    }
  });

  test('the X domain covers the usage and the whole forecast', () => {
    const { data, xDomain } = withForecast(usage, forecast);
    expect(xDomain).toEqual([900, 1000 + 86400]);
    expect(data.map((d) => d.timestamp)).toEqual([900, 1000, 1000 + 3600, 1000 + 86400]);
  });

  test('the forecast starts on the last usage row, keeping its usage and pod values', () => {
    const { data } = withForecast(usage, forecast);
    const lastUsage = data.find((d) => d.timestamp === 1000)!;
    expect(lastUsage).toMatchObject({ usage: 0.49, pod_a: 0.4, pod_b: 0.58, forecast: 0.49 });
    const firstForecastAfter = data.find((d) => d.timestamp > 1000)!;
    expect(firstForecastAfter.usage).toBeUndefined();
    expect(firstForecastAfter.forecast).toBe(0.6);
  });

  test('does not modify the input rows', () => {
    const copy = structuredClone(usage);
    withForecast(usage, forecast);
    expect(usage).toEqual(copy);
  });

  test('toggling the forecast off restores the original rows', () => {
    withForecast(usage, forecast);
    expect(withForecast(usage, undefined)).toEqual({ data: usage });
  });

  test('the Y domain includes the forecast interval', () => {
    const { data } = withForecast(usage, forecast);
    const keys = visibleSeriesKeys({ podNames: [], lineNames: [], forecast: true, hidden: new Set() });
    const [lower, upper] = computeYDomain(collectYValues(data, keys));
    expect(upper).toBeGreaterThan(2.5);
    expect(lower).toBeLessThanOrEqual(0.1);
    const withoutBand = computeYDomain(
      collectYValues(data, visibleSeriesKeys({ podNames: [], lineNames: [], forecast: true, hidden: new Set(['forecastRange']) })),
    );
    expect(withoutBand[1]).toBeLessThan(2.5);
  });

  test('the Y domain includes percentile bounds carried as lines', () => {
    const rows = usage.map((d) => ({ ...d, 'Observed P95': 0.8, 'Observed P99': 1.2 }));
    const keys = visibleSeriesKeys({ podNames: [], lineNames: ['Observed P95', 'Observed P99'], forecast: false, hidden: new Set() });
    const [lower, upper] = computeYDomain(collectYValues(rows, keys));
    expect(lower).toBeLessThan(0.4);
    expect(upper).toBeGreaterThan(1.2);
  });
});

describe('describeForecast', () => {
  test.each([
    [{ model: 'ARIMA(1,1,1)', level: 0.95 }, { model: 'ARIMA(1,1,1)', interval: '95% interval' }],
    [{ model: ' ARIMA(2,0,1) ', level: 0.8 }, { model: 'ARIMA(2,0,1)', interval: '80% interval' }],
    [{ model: 'naive', level: 90 }, { model: 'naive', interval: '90% interval' }],
    [{ model: '', level: 0 }, { model: undefined, interval: undefined }],
    [{ model: null, level: null }, { model: undefined, interval: undefined }],
    [{ model: 42, level: NaN }, { model: undefined, interval: undefined }],
    [undefined, { model: undefined, interval: undefined }],
  ])('describes case %#', (input, expected) => {
    expect(describeForecast(input as never)).toEqual(expected);
  });
});

describe('formatChartValue', () => {
  test.each([
    [0, 'cpu', '0m', '0m'],
    [0.492, 'cpu', '492m', '492m'],
    [1.5, 'cpu', '1.50', '1.5'],
    [999, 'cpu', '999.00', '999.0'],
    [1500, 'cpu', '1.5K', '1.5K'],
    [2e6, 'cpu', '2M', '2M'],
    [1e18, 'cpu', '1.0e+18', '1.0e+18'],
    [0, 'memory', '0 Mi', '0M'],
    [358.4, 'memory', '358 Mi', '358M'],
    [1024, 'memory', '1.00 Gi', '1.0G'],
    [1536, 'memory', '1.50 Gi', '1.5G'],
    [2 * 1024 ** 2, 'memory', '2.00 Ti', '2.0T'],
    [8 * 2 ** 40, 'memory', '8.00 Ei', '8.0E'],
  ] as const)('formats %p %s', (value, resourceType, tooltip, axis) => {
    expect(formatChartValue(value, resourceType, 'tooltip')).toBe(tooltip);
    expect(formatChartValue(value, resourceType, 'axis')).toBe(axis);
  });

  test.each([undefined, null, NaN, Infinity, -Infinity])('returns "-" for %p', (value) => {
    expect(formatChartValue(value, 'cpu', 'tooltip')).toBe('-');
    expect(formatChartValue(value, 'memory', 'axis')).toBe('-');
  });
});
