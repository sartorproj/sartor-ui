import { describe, expect, test } from 'bun:test';
import {
  analysisHealth,
  clusterLabel,
  describeAnalysis,
  formatCores,
  formatCost,
  formatGiB,
  isOpenCostReady,
  openCostProblem,
  rankGains,
  tailoringPath,
  UNNAMED_CLUSTER_LABEL,
} from './analytics';
import type { TailoringSummary, TopGain } from './api';

describe('formatCores', () => {
  test.each([
    [0, '0 cores'],
    [NaN, '0 cores'],
    [Infinity, '0 cores'],
    [1, '1 core'],
    [12.5, '12.5 cores'],
    [1.234, '1.23 cores'],
    [0.05, '0.05 cores'],
    [0.1234, '0.123 cores'],
    [0.0042, '0.004 cores'],
    [0.0001, '< 0.001 cores'],
    [-0.0001, '> -0.001 cores'],
    [-0.5, '-0.5 cores'],
    [-3, '-3 cores'],
    [1234.5, '1,235 cores'],
  ])('%p -> %s', (value, expected) => {
    expect(formatCores(value)).toBe(expected);
  });
});

describe('formatGiB', () => {
  test.each([
    [0, '0 GiB'],
    [NaN, '0 GiB'],
    [120 / 1024, '120 MiB'],
    [0.5, '512 MiB'],
    [5 / 1024, '5 MiB'],
    [1.5 / 1024, '1.5 MiB'],
    [0.0001, '< 1 MiB'],
    [-0.0001, '> -1 MiB'],
    [1023.9 / 1024, '1 GiB'],
    [1, '1 GiB'],
    [2.345, '2.35 GiB'],
    [150.4, '150 GiB'],
    [-0.25, '-256 MiB'],
    [-2, '-2 GiB'],
    [2048, '2 TiB'],
  ])('%p -> %s', (value, expected) => {
    expect(formatGiB(value)).toBe(expected);
  });
});

describe('formatCost', () => {
  test('formats a currency with an optional period', () => {
    expect(formatCost(12.345, 'USD')).toBe('$12.35');
    expect(formatCost(-3, 'EUR', 'month')).toBe('-€3.00/month');
  });

  test('falls back for an invalid currency code', () => {
    expect(formatCost(5, 'not-a-currency')).toBe('5 not-a-currency');
  });
});

describe('clusterLabel', () => {
  test('labels a cluster without a name', () => {
    expect(clusterLabel('')).toBe(UNNAMED_CLUSTER_LABEL);
    expect(clusterLabel('  ')).toBe(UNNAMED_CLUSTER_LABEL);
    expect(clusterLabel('example-cluster')).toBe('example-cluster');
  });
});

describe('tailoringPath', () => {
  test('encodes the segments', () => {
    expect(tailoringPath('example-namespace', 'example app')).toBe('/tailorings/example-namespace/example%20app');
  });
});

const gain = (container: string, cpu: number, mem: number): TopGain => ({
  cluster: '',
  namespace: 'example-namespace',
  tailoring: 'example-app',
  container,
  reclaimableCpuCores: cpu,
  reclaimableMemoryGiB: mem,
});

describe('rankGains', () => {
  const gains = [gain('a', 0.5, 4), gain('b', 2, 0), gain('c', -1, 1), gain('d', 0, 0.01)];

  test('ranks by CPU and drops entries with nothing reclaimable', () => {
    expect(rankGains(gains, 'cpu').map((g) => g.container)).toEqual(['b', 'a']);
  });

  test('ranks by memory', () => {
    expect(rankGains(gains, 'memory').map((g) => g.container)).toEqual(['a', 'c', 'd']);
  });

  test('applies the limit and handles no gains', () => {
    expect(rankGains(gains, 'memory', 1).map((g) => g.container)).toEqual(['a']);
    expect(rankGains([], 'cpu')).toEqual([]);
  });
});

const NOW = new Date('2026-01-01T12:00:00Z');

const tailoring = (overrides: Partial<TailoringSummary> = {}): TailoringSummary => ({
  name: 'example-app',
  namespace: 'example-namespace',
  targetKind: 'Deployment',
  targetName: 'example-app',
  paused: false,
  targetFound: true,
  vpaDetected: false,
  containerCount: 1,
  readyCondition: 'True',
  ...overrides,
});

describe('describeAnalysis', () => {
  test('a Tailoring without any condition or analysis is pending', () => {
    expect(describeAnalysis(tailoring(), NOW)).toEqual({
      kind: 'pending',
      lastAnalysis: undefined,
      reason: undefined,
      message: undefined,
      consecutiveFailures: 0,
      nextAnalysis: undefined,
    });
  });

  test('a past analysis without a condition counts as analyzed', () => {
    const d = describeAnalysis(tailoring({ lastAnalysis: '2026-01-01T11:00:00Z' }), NOW);
    expect(d.kind).toBe('analyzed');
    expect(d.lastAnalysis).toEqual(new Date('2026-01-01T11:00:00Z'));
  });

  test('a false Analyzed condition is failing, even after an earlier analysis', () => {
    const d = describeAnalysis(
      tailoring({ lastAnalysis: '2026-01-01T11:00:00Z', analyzedStatus: 'False', analyzedReason: 'PrometheusError' }),
      NOW,
    );
    expect(d.kind).toBe('failing');
    expect(d.reason).toBe('PrometheusError');
  });

  test('a failing Tailoring without a reason reports Unknown', () => {
    expect(describeAnalysis(tailoring({ analyzedStatus: 'False' }), NOW).reason).toBe('Unknown');
  });

  test.each([
    ['2026-01-01T12:05:00Z', false],
    ['2026-01-01T11:55:00Z', true],
    ['2026-01-01T12:00:00Z', true],
  ])('next analysis at %s is overdue: %p', (time, overdue) => {
    const d = describeAnalysis(tailoring({ analyzedStatus: 'False', analyzedReason: 'TargetNotFound', nextAnalysisTime: time }), NOW);
    expect(d.nextAnalysis).toEqual({ at: new Date(time), overdue });
  });

  test('an unparseable lastAnalysis is ignored', () => {
    expect(describeAnalysis(tailoring({ lastAnalysis: 'yesterday' }), NOW).kind).toBe('pending');
  });
});

describe('analysisHealth', () => {
  test('counts analyzed, pending and failing per reason', () => {
    const health = analysisHealth(
      [
        tailoring({ lastAnalysis: '2026-01-01T11:00:00Z' }),
        tailoring({ analyzedStatus: 'True' }),
        tailoring(),
        tailoring({ analyzedStatus: 'False', analyzedReason: 'TargetNotFound' }),
        tailoring({ analyzedStatus: 'False', analyzedReason: 'TargetNotFound' }),
        tailoring({ analyzedStatus: 'False', analyzedReason: 'PrometheusError' }),
        tailoring({ analyzedStatus: 'False' }),
      ],
      NOW,
    );
    expect(health).toEqual({
      analyzed: 2,
      pending: 1,
      failing: 4,
      failingByReason: [
        { reason: 'TargetNotFound', count: 2 },
        { reason: 'PrometheusError', count: 1 },
        { reason: 'Unknown', count: 1 },
      ],
    });
  });

  test('handles no Tailorings', () => {
    expect(analysisHealth([], NOW)).toEqual({ analyzed: 0, pending: 0, failing: 0, failingByReason: [] });
  });
});

describe('OpenCost health', () => {
  test('is ready only when enabled and connected', () => {
    expect(isOpenCostReady({ enabled: true, connected: true })).toBe(true);
    expect(isOpenCostReady({ enabled: true, connected: false })).toBe(false);
    expect(isOpenCostReady({ enabled: false, connected: true })).toBe(false);
    expect(isOpenCostReady(undefined)).toBe(false);
  });

  test.each([
    ['healthy', { isLoading: false, data: { enabled: true, connected: true } }, undefined],
    ['not enabled', { isLoading: false, data: { enabled: false, connected: false } }, 'OpenCost integration is not enabled. Configure it in your Atelier resource.'],
    ['disconnected', { isLoading: false, data: { enabled: true, connected: false, error: 'connection refused' } }, 'Unable to connect to OpenCost: connection refused'],
    ['disconnected without an error', { isLoading: false, data: { enabled: true, connected: false } }, 'Unable to connect to OpenCost: Unknown error'],
    ['health request failed', { isLoading: false, error: new Error('Request failed with status code 502') }, 'Unable to check OpenCost status: Request failed with status code 502'],
  ])('%s', (_, health, expected) => {
    expect(openCostProblem(health)).toBe(expected);
  });
});
