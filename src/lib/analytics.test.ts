import { describe, expect, test } from 'bun:test';
import {
  analysisHealth,
  clusterLabel,
  cpuNetChangeText,
  describeAnalysis,
  formatCores,
  formatCostPerHour,
  formatGiB,
  formatPercent,
  gainsFor,
  groupSavingsByCluster,
  hasRequestedTotals,
  isOpenCostReady,
  memoryNetChangeText,
  percentOf,
  openCostProblem,
  skippedBreakdown,
  skippedCount,
  tailoringPath,
  UNNAMED_CLUSTER_LABEL,
} from './analytics';
import { normalizeSavings, normalizeTopGains, type ContainerGain, type TailoringSummary } from './api';

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

describe('formatPercent', () => {
  test.each([
    [undefined, '—'],
    [NaN, '—'],
    [Infinity, '—'],
    [0, '0%'],
    [-0, '0%'],
    [12.5, '12.5%'],
    [-4.854, '-4.9%'],
    [0.01, '< 0.1%'],
    [-0.01, '> -0.1%'],
    [100, '100%'],
    [-350, '-350%'],
    [12345.67, '12,345.7%'],
  ])('%p -> %s', (value, expected) => {
    expect(formatPercent(value)).toBe(expected);
  });
});

describe('percentOf', () => {
  test('is undefined for a zero, negative or unknown total', () => {
    expect(percentOf(5, 0)).toBeUndefined();
    expect(percentOf(5, -1)).toBeUndefined();
    expect(percentOf(5, undefined)).toBeUndefined();
    expect(percentOf(NaN, 10)).toBeUndefined();
    expect(percentOf(-20, 400)).toBe(-5);
  });
});

describe('net change text', () => {
  test('describes the requested total and the net change', () => {
    expect(cpuNetChangeText({ reclaimableCores: 0, increaseCores: 20, netCores: -20, totalRequestedCores: 412, netPercent: (-20 / 412) * 100 })).toBe(
      '412 cores requested, net -20 cores (-4.9%)',
    );
    expect(memoryNetChangeText({ reclaimableGiB: 300, increaseGiB: 0, netGiB: 300, totalRequestedGiB: 1536, netPercent: 19.53 })).toBe(
      '1.5 TiB requested, net 300 GiB (19.5%)',
    );
  });

  test('uses dashes for a missing total or percentage', () => {
    expect(cpuNetChangeText({ reclaimableCores: 0, increaseCores: 0, netCores: 0, totalRequestedCores: 0 })).toBe('0 cores requested, net 0 cores (—)');
    expect(memoryNetChangeText({ reclaimableGiB: 0, increaseGiB: 0, netGiB: 0 })).toBe('— requested, net 0 GiB (—)');
  });
});

describe('hasRequestedTotals', () => {
  test('is false for a server that predates the totals', () => {
    expect(hasRequestedTotals(normalizeSavings({ totals: amounts(1, 0, 1, 0), byCluster: [{ cluster: '', ...amounts(1, 0, 1, 0) }] }))).toBe(false);
    expect(hasRequestedTotals(normalizeSavings({}))).toBe(false);
  });

  test('is true when any group has one, even a zero total', () => {
    expect(hasRequestedTotals(normalizeSavings({ totals: { cpu: { totalRequestedCores: 0, netPercent: null } } }))).toBe(true);
    expect(hasRequestedTotals(normalizeSavings({ byNamespace: [{ cluster: '', memory: { totalRequestedGiB: 2 } }] }))).toBe(true);
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

describe('formatCostPerHour', () => {
  test('formats an hourly amount without assuming a currency', () => {
    expect(formatCostPerHour(12.345)).toBe('12.35/h');
    expect(formatCostPerHour(-3)).toBe('-3/h');
    expect(formatCostPerHour(NaN)).toBe('0/h');
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

const amounts = (reclaimableCores: number, increaseCores: number, reclaimableGiB: number, increaseGiB: number) => ({
  cpu: { reclaimableCores, increaseCores, netCores: reclaimableCores - increaseCores },
  memory: { reclaimableGiB, increaseGiB, netGiB: reclaimableGiB - increaseGiB },
});

describe('groupSavingsByCluster', () => {
  test('nests the flat byNamespace list under its cluster, largest reclaimable CPU first', () => {
    const clusters = groupSavingsByCluster(
      normalizeSavings({
        byCluster: [
          { cluster: '', tailorings: 1, ...amounts(0, 0.5, 0, 0) },
          { cluster: 'example-cluster', tailorings: 3, ...amounts(2, 0, 1, 0) },
        ],
        byNamespace: [
          { cluster: '', namespace: 'example-namespace', tailorings: 1, ...amounts(0, 0.5, 0, 0) },
          { cluster: 'example-cluster', namespace: 'example-a', tailorings: 1, ...amounts(0.5, 0, 1, 0) },
          { cluster: 'example-cluster', namespace: 'example-b', tailorings: 2, ...amounts(1.5, 0, 0, 0) },
        ],
      }),
    );
    expect(clusters.map((c) => [c.cluster, c.tailorings, c.namespaces.map((n) => n.namespace)])).toEqual([
      ['', 1, ['example-namespace']],
      ['example-cluster', 3, ['example-b', 'example-a']],
    ]);
    expect(clusters[1].cpu.reclaimableCores).toBe(2);
    expect(clusters[1].namespace).toBeUndefined();
  });

  test('sums namespaces whose cluster is missing from byCluster', () => {
    const [cluster] = groupSavingsByCluster(
      normalizeSavings({
        byNamespace: [
          { cluster: 'example-cluster', namespace: 'example-a', tailorings: 1, ...amounts(0.5, 0, 1, 0.25), cost: { reclaimablePerHour: 1, increasePerHour: 0, netPerHour: 1 } },
          { cluster: 'example-cluster', namespace: 'example-b', tailorings: 2, ...amounts(1, 0.25, 0, 0) },
        ],
      }),
    );
    expect(cluster.tailorings).toBe(3);
    expect(cluster.cpu).toEqual({ reclaimableCores: 1.5, increaseCores: 0.25, netCores: 1.25 });
    expect(cluster.memory).toEqual({ reclaimableGiB: 1, increaseGiB: 0.25, netGiB: 0.75 });
    expect(cluster.cost).toEqual({ reclaimablePerHour: 1, increasePerHour: 0, netPerHour: 1 });
  });

  test('sums requested totals of derived clusters and recomputes the percentage from them', () => {
    const ns = (namespace: string, net: number, total: number | null) => ({
      cluster: 'example-cluster',
      namespace,
      tailorings: 1,
      cpu: { netCores: net, totalRequestedCores: total, netPercent: total ? (net / total) * 100 : null },
      memory: { netGiB: net, totalRequestedGiB: total, netPercent: total ? (net / total) * 100 : null },
    });
    const [cluster] = groupSavingsByCluster(normalizeSavings({ byNamespace: [ns('example-a', 10, 100), ns('example-b', -30, 100)] }));
    expect(cluster.cpu.totalRequestedCores).toBe(200);
    expect(cluster.cpu.netPercent).toBe(-10);
    expect(cluster.memory.totalRequestedGiB).toBe(200);
    expect(cluster.memory.netPercent).toBe(-10);

    const [zero] = groupSavingsByCluster(normalizeSavings({ byNamespace: [ns('example-a', 0, 0), ns('example-b', 0, 0)] }));
    expect(zero.cpu.totalRequestedCores).toBe(0);
    expect(zero.cpu.netPercent).toBeUndefined();

    const [older] = groupSavingsByCluster(normalizeSavings({ byNamespace: [ns('example-a', 1, 10), { cluster: 'example-cluster', namespace: 'example-b', tailorings: 1 }] }));
    expect(older.cpu.totalRequestedCores).toBeUndefined();
    expect(older.cpu.netPercent).toBeUndefined();
  });

  test('keeps the server percentages of clusters listed in byCluster', () => {
    const [cluster] = groupSavingsByCluster(
      normalizeSavings({
        byCluster: [{ cluster: 'example-cluster', tailorings: 1, cpu: { netCores: -20, totalRequestedCores: 412, netPercent: -4.85 } }],
        byNamespace: [{ cluster: 'example-cluster', namespace: 'example-a', tailorings: 1, cpu: { netCores: 1, totalRequestedCores: 1, netPercent: 100 } }],
      }),
    );
    expect(cluster.cpu.totalRequestedCores).toBe(412);
    expect(cluster.cpu.netPercent).toBe(-4.85);
  });

  test('handles an empty report and clusters without namespaces', () => {
    expect(groupSavingsByCluster(normalizeSavings({}))).toEqual([]);
    const [cluster] = groupSavingsByCluster(normalizeSavings({ byCluster: [{ cluster: 'example-cluster', tailorings: 1 }] }));
    expect(cluster.namespaces).toEqual([]);
  });
});

describe('skippedBreakdown', () => {
  test('lists the reasons with skipped Tailorings', () => {
    const counts = { total: 9, included: 3, skippedNoAnalysis: 4, skippedNoReplicas: 0, skippedNoCurrentRequest: 2 };
    expect(skippedBreakdown(counts)).toEqual([
      { key: 'skippedNoAnalysis', label: 'not analyzed yet', count: 4 },
      { key: 'skippedNoCurrentRequest', label: 'no current request', count: 2 },
    ]);
    expect(skippedCount(counts)).toBe(6);
  });
});

const gain = (container: string, cpuSavingCores?: number, memorySavingGiB?: number): Partial<ContainerGain> => ({
  namespace: 'example-namespace',
  tailoring: 'example-app',
  container,
  replicas: 2,
  cpuSavingCores,
  memorySavingGiB,
});

describe('gainsFor', () => {
  const report = normalizeTopGains({
    byCPU: [gain('a', 0.5), gain('b', 2), gain('c', -1), gain('d')],
    byMemory: [gain('a', 0.5, 4), gain('e', undefined, 0.01), gain('f', 1, 0)],
  });

  test('uses the ranking for the resource and drops entries with nothing reclaimable', () => {
    expect(gainsFor(report, 'cpu').map((g) => g.container)).toEqual(['b', 'a']);
    expect(gainsFor(report, 'memory').map((g) => g.container)).toEqual(['a', 'e']);
  });

  test('applies the limit and handles no gains', () => {
    expect(gainsFor(report, 'memory', 1).map((g) => g.container)).toEqual(['a']);
    expect(gainsFor(normalizeTopGains({}), 'cpu')).toEqual([]);
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
      tailoring({ lastAnalysis: '2026-01-01T11:00:00Z', analyzedCondition: 'False', analyzedReason: 'PrometheusError' }),
      NOW,
    );
    expect(d.kind).toBe('failing');
    expect(d.reason).toBe('PrometheusError');
  });

  test('FitProfileFallback on a true Analyzed condition is a warning, not a failure', () => {
    const d = describeAnalysis(
      tailoring({
        lastAnalysis: '2026-01-01T11:00:00Z',
        analyzedCondition: 'True',
        analyzedReason: 'FitProfileFallback',
        analyzedMessage: 'Resource analysis completed with a fallback: unknown strategy',
      }),
      NOW,
    );
    expect(d.kind).toBe('warning');
    expect(d.reason).toBe('FitProfileFallback');
  });

  test('an Unknown Analyzed condition without an analysis is pending', () => {
    expect(describeAnalysis(tailoring({ analyzedCondition: 'Unknown', analyzedReason: 'Reconciling' }), NOW).kind).toBe('pending');
  });

  test('a failing Tailoring without a reason reports Unknown', () => {
    expect(describeAnalysis(tailoring({ analyzedCondition: 'False' }), NOW).reason).toBe('Unknown');
  });

  test.each([
    ['2026-01-01T12:05:00Z', false],
    ['2026-01-01T11:55:00Z', true],
    ['2026-01-01T12:00:00Z', true],
  ])('next analysis at %s is overdue: %p', (time, overdue) => {
    const d = describeAnalysis(tailoring({ analyzedCondition: 'False', analyzedReason: 'TargetNotFound', nextAnalysisTime: time }), NOW);
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
        tailoring({ analyzedCondition: 'True' }),
        tailoring(),
        tailoring({ analyzedCondition: 'False', analyzedReason: 'TargetNotFound' }),
        tailoring({ analyzedCondition: 'False', analyzedReason: 'TargetNotFound' }),
        tailoring({ analyzedCondition: 'False', analyzedReason: 'PrometheusError' }),
        tailoring({ analyzedCondition: 'False' }),
        tailoring({ analyzedCondition: 'True', analyzedReason: 'FitProfileFallback' }),
      ],
      NOW,
    );
    expect(health).toEqual({
      analyzed: 2,
      warning: 1,
      pending: 1,
      failing: 4,
      warningByReason: [{ reason: 'FitProfileFallback', count: 1 }],
      failingByReason: [
        { reason: 'TargetNotFound', count: 2 },
        { reason: 'PrometheusError', count: 1 },
        { reason: 'Unknown', count: 1 },
      ],
    });
  });

  test('handles no Tailorings', () => {
    expect(analysisHealth([], NOW)).toEqual({ analyzed: 0, warning: 0, pending: 0, failing: 0, warningByReason: [], failingByReason: [] });
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
