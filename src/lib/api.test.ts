import { afterAll, describe, expect, test } from 'bun:test';
import { AxiosError } from 'axios';

let lastQuery: URLSearchParams | undefined;
let lastPath: string | undefined;
// Response for /api/v1/prometheus/forecast; every other path answers like the metrics endpoint.
let forecastResponse: () => Response = () => Response.json({ success: true, data: {} });
// Response for /api/v1/analytics/*.
let analyticsResponse: () => Response = () => Response.json({ success: true, data: {} });
// Response for /api/v1/tailorings/{namespace}/{name}.
let tailoringResponse: () => Response = () => Response.json({ success: true, data: {} });
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    lastQuery = url.searchParams;
    lastPath = url.pathname;
    if (url.pathname === '/api/v1/prometheus/forecast') return forecastResponse();
    if (url.pathname.startsWith('/api/v1/analytics/')) return analyticsResponse();
    if (url.pathname.startsWith('/api/v1/tailorings/')) return tailoringResponse();
    return Response.json({ success: true, data: [{ timestamp: 1, value: 2 }] });
  },
});
afterAll(() => {
  server.stop(true);
});

// The API base URL is read when the module loads, so import it after the stub server is up.
process.env.VITE_API_URL = server.url.origin;
const {
  default: axiosInstance,
  apiClient,
  EndpointUnavailableError,
  ForecastUnavailableError,
  forecastError,
  forecastParams,
  normalizeSavings,
  normalizeTopGains,
  prometheusMetricsParams,
  tailoringAnalysisState,
  tailoringMetricsTarget,
} = await import('./api');
// Another test file may have loaded the module first, with the default base URL.
axiosInstance.defaults.baseURL = server.url.origin;
type Tailoring = import('./api').Tailoring;

const tailoring = (target: Tailoring['spec']['target'], namespace = 'example-system'): Tailoring => ({
  metadata: { name: 'example-tailoring', namespace, creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: {
    target,
    fitProfileRef: { name: 'balanced' },
    writeBack: { repository: 'example/repo', path: 'deploy.yaml', type: 'raw' },
    paused: false,
  },
  status: {},
});

const base = {
  namespace: 'default',
  podNamePrefix: 'example-app',
  containerName: 'app',
  resourceType: 'memory',
} as const;

const params = (window?: string, target?: { cluster?: string; kind?: string }) =>
  prometheusMetricsParams(base.namespace, base.podNamePrefix, base.containerName, base.resourceType, window, target);

describe('prometheusMetricsParams', () => {
  test('passes cluster and kind when the target has them', () => {
    expect(params('1h', { cluster: 'example-cluster', kind: 'StatefulSet' })).toEqual({
      ...base,
      window: '1h',
      cluster: 'example-cluster',
      kind: 'StatefulSet',
    });
  });

  test.each(['Deployment', 'StatefulSet', 'DaemonSet'])('passes kind %s', (kind) => {
    expect(params('1h', { kind }).kind).toBe(kind);
  });

  test.each([
    ['no target', undefined],
    ['an empty target', {}],
    ['empty strings', { cluster: '', kind: '' }],
  ])('omits cluster and kind for %s', (_, target) => {
    const result = params(undefined, target);
    expect(result).toEqual({ ...base });
    expect('cluster' in result).toBe(false);
    expect('kind' in result).toBe(false);
    expect('window' in result).toBe(false);
  });

  test('omits cluster but keeps kind when the target has no cluster', () => {
    const result = params('6h', { kind: 'DaemonSet' });
    expect(result).toEqual({ ...base, window: '6h', kind: 'DaemonSet' });
    expect('cluster' in result).toBe(false);
  });

  test('omits kind but keeps cluster when the target has no kind', () => {
    const result = params('1h', { cluster: 'example-cluster' });
    expect(result).toEqual({ ...base, window: '1h', cluster: 'example-cluster' });
    expect('kind' in result).toBe(false);
  });
});

describe('apiClient.getPrometheusMetrics', () => {
  test('sends cluster and kind as query parameters', async () => {
    const data = await apiClient.getPrometheusMetrics('default', 'example-app', 'app', 'cpu', '1h', {
      cluster: 'example-cluster',
      kind: 'StatefulSet',
    });
    expect(data).toEqual([{ timestamp: 1, value: 2 }]);
    expect(Object.fromEntries(lastQuery!)).toEqual({
      namespace: 'default',
      podNamePrefix: 'example-app',
      containerName: 'app',
      resourceType: 'cpu',
      window: '1h',
      cluster: 'example-cluster',
      kind: 'StatefulSet',
    });
  });

  test('sends no cluster parameter for a target without one', async () => {
    await apiClient.getPrometheusMetrics('default', 'example-app', 'app', 'memory', '1h', { kind: 'Deployment' });
    expect(lastQuery!.has('cluster')).toBe(false);
    expect(lastQuery!.get('kind')).toBe('Deployment');
  });

  test('keeps the previous request shape when no target is given', async () => {
    await apiClient.getPrometheusMetrics('default', 'example-app', 'app', 'memory');
    expect(Object.fromEntries(lastQuery!)).toEqual({
      namespace: 'default',
      podNamePrefix: 'example-app',
      containerName: 'app',
      resourceType: 'memory',
    });
  });
});

describe('tailoringMetricsTarget', () => {
  test('uses the target namespace when it differs from the Tailoring namespace', () => {
    expect(
      tailoringMetricsTarget(
        tailoring({ kind: 'StatefulSet', name: 'example-app', namespace: 'example-apps', cluster: 'example-cluster' }),
      ),
    ).toEqual({ namespace: 'example-apps', name: 'example-app', cluster: 'example-cluster', kind: 'StatefulSet' });
  });

  test('uses the target namespace when it matches the Tailoring namespace', () => {
    const target = tailoringMetricsTarget(
      tailoring({ kind: 'Deployment', name: 'example-app', namespace: 'example-apps' }, 'example-apps'),
    );
    expect(target.namespace).toBe('example-apps');
  });

  test.each([
    ['unset', undefined],
    ['empty', ''],
  ])('falls back to the Tailoring namespace when the target namespace is %s', (_, namespace) => {
    const target = tailoringMetricsTarget(tailoring({ kind: 'DaemonSet', name: 'example-agent', namespace }));
    expect(target).toEqual({ namespace: 'example-system', name: 'example-agent', cluster: undefined, kind: 'DaemonSet' });
  });
});

describe('metrics requests for a Tailoring', () => {
  const crossNamespace = tailoring({
    kind: 'StatefulSet',
    name: 'example-app',
    namespace: 'example-apps',
    cluster: 'example-cluster',
  });
  const sameNamespace = tailoring({ kind: 'Deployment', name: 'example-web' });

  test('getPrometheusMetrics queries the target namespace, cluster and kind', async () => {
    const target = tailoringMetricsTarget(crossNamespace);
    await apiClient.getPrometheusMetrics(target.namespace, target.name, 'app', 'cpu', '1h', target);
    expect(Object.fromEntries(lastQuery!)).toEqual({
      namespace: 'example-apps',
      podNamePrefix: 'example-app',
      containerName: 'app',
      resourceType: 'cpu',
      window: '1h',
      cluster: 'example-cluster',
      kind: 'StatefulSet',
    });
  });

  test('getPrometheusMetrics falls back to the Tailoring namespace', async () => {
    const target = tailoringMetricsTarget(sameNamespace);
    await apiClient.getPrometheusMetrics(target.namespace, target.name, 'web', 'memory', '1h', target);
    expect(Object.fromEntries(lastQuery!)).toEqual({
      namespace: 'example-system',
      podNamePrefix: 'example-web',
      containerName: 'web',
      resourceType: 'memory',
      window: '1h',
      kind: 'Deployment',
    });
  });

  test('getPrometheusMetricsPerPod queries the target namespace, cluster and kind', async () => {
    const target = tailoringMetricsTarget(crossNamespace);
    await apiClient.getPrometheusMetricsPerPod(target.namespace, target.name, 'app', 'memory', '6h', target);
    expect(Object.fromEntries(lastQuery!)).toEqual({
      namespace: 'example-apps',
      podNamePrefix: 'example-app',
      containerName: 'app',
      resourceType: 'memory',
      window: '6h',
      cluster: 'example-cluster',
      kind: 'StatefulSet',
      perPod: 'true',
    });
  });

  test('getPrometheusMetricsPerPod falls back to the Tailoring namespace and omits an empty cluster', async () => {
    const target = tailoringMetricsTarget(sameNamespace);
    await apiClient.getPrometheusMetricsPerPod(target.namespace, target.name, 'web', 'cpu', undefined, target);
    expect(Object.fromEntries(lastQuery!)).toEqual({
      namespace: 'example-system',
      podNamePrefix: 'example-web',
      containerName: 'web',
      resourceType: 'cpu',
      kind: 'Deployment',
      perPod: 'true',
    });
  });

  test('getPrometheusMetricsPerPod keeps the previous request shape when no target is given', async () => {
    await apiClient.getPrometheusMetricsPerPod('default', 'example-app', 'app', 'cpu');
    expect(Object.fromEntries(lastQuery!)).toEqual({
      namespace: 'default',
      podNamePrefix: 'example-app',
      containerName: 'app',
      resourceType: 'cpu',
      perPod: 'true',
    });
  });
});

describe('forecastParams', () => {
  test('sends the metrics parameters plus the default horizon and confidence', () => {
    expect(
      forecastParams('default', 'example-app', 'app', 'cpu', '1h', { cluster: 'example-cluster', kind: 'StatefulSet' }),
    ).toEqual({
      ...prometheusMetricsParams('default', 'example-app', 'app', 'cpu', '1h', {
        cluster: 'example-cluster',
        kind: 'StatefulSet',
      }),
      horizon: '24h',
      confidence: '0.95',
    });
  });

  test('passes a custom horizon and confidence', () => {
    const result = forecastParams('default', 'example-app', 'app', 'memory', '6h', undefined, {
      horizon: '48h',
      confidence: 0.8,
    });
    expect(result.horizon).toBe('48h');
    expect(result.confidence).toBe('0.8');
  });
});

describe('apiClient.getPrometheusForecast', () => {
  const forecast = {
    history: [{ timestamp: 100, value: 0.4 }],
    forecast: [{ timestamp: 160, value: 0.5, lower: 0.3, upper: 0.7 }],
    level: 0.95,
    model: 'ARIMA(1,1,1)',
    sampleInterval: 60,
  };
  const target = tailoringMetricsTarget(
    tailoring({ kind: 'StatefulSet', name: 'example-app', namespace: 'example-apps', cluster: 'example-cluster' }),
  );
  const fetchForecast = () =>
    apiClient.getPrometheusForecast(target.namespace, target.name, 'app', 'cpu', '1h', target);

  test('sends the same parameters as getPrometheusMetrics plus horizon and confidence', async () => {
    forecastResponse = () => Response.json({ success: true, data: forecast });
    await apiClient.getPrometheusMetrics(target.namespace, target.name, 'app', 'cpu', '1h', target);
    const metricsQuery = Object.fromEntries(lastQuery!);

    expect(await fetchForecast()).toEqual(forecast);
    expect(lastPath).toBe('/api/v1/prometheus/forecast');
    expect(Object.fromEntries(lastQuery!)).toEqual({ ...metricsQuery, horizon: '24h', confidence: '0.95' });
  });

  test('returns an empty forecast with its fallback reason instead of failing', async () => {
    const empty = { ...forecast, forecast: [], fallbackReason: 'not enough samples' };
    forecastResponse = () => Response.json({ success: true, data: empty });
    expect(await fetchForecast()).toEqual(empty);
  });

  test('reports a server without the endpoint as unavailable', async () => {
    forecastResponse = () => new Response('404 page not found\n', { status: 404 });
    const err = await fetchForecast().catch((e) => e);
    expect(err).toBeInstanceOf(ForecastUnavailableError);
    expect(err.message).toContain('not available');
  });

  test('shows the server message for a 404 with a JSON error', async () => {
    forecastResponse = () => Response.json({ success: false, error: 'workload not found' }, { status: 404 });
    const err = await fetchForecast().catch((e) => e);
    expect(err).not.toBeInstanceOf(ForecastUnavailableError);
    expect(err.message).toBe('workload not found');
  });

  test('shows the server message for a 500', async () => {
    forecastResponse = () => Response.json({ success: false, error: 'Prometheus query failed' }, { status: 500 });
    await expect(fetchForecast()).rejects.toThrow('Prometheus query failed');
  });

  test('shows the status for a 500 without a message', async () => {
    forecastResponse = () => new Response('', { status: 500 });
    await expect(fetchForecast()).rejects.toThrow('Forecast request failed with status 500');
  });

  test.each([
    ['success false', { success: false, error: 'model did not converge' }, 'model did not converge'],
    ['no data', { success: true }, 'The server returned no forecast'],
    ['null data', { success: true, data: null }, 'The server returned no forecast'],
    ['a non-string error', { success: false, error: 42 }, 'The server returned no forecast'],
  ])('throws instead of returning an empty series for %s', async (_, body, message) => {
    forecastResponse = () => Response.json(body);
    await expect(fetchForecast()).rejects.toThrow(message);
  });

  test('throws for a non-JSON 200 body', async () => {
    forecastResponse = () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } });
    await expect(fetchForecast()).rejects.toThrow('The server returned no forecast');
  });

  test('leaves getPrometheusMetrics responses untouched', async () => {
    expect(await apiClient.getPrometheusMetrics('default', 'example-app', 'app', 'cpu')).toEqual([
      { timestamp: 1, value: 2 },
    ]);
  });
});

describe('forecastError', () => {
  test('keeps the message of a network error', () => {
    expect(forecastError(new AxiosError('Network Error', 'ERR_NETWORK')).message).toBe('Network Error');
  });

  test('passes other errors through', () => {
    const err = new Error('boom');
    expect(forecastError(err)).toBe(err);
    expect(forecastError('boom').message).toBe('boom');
  });
});

// Shapes as returned by the server's /api/v1/analytics endpoints.
const amounts = (reclaimableCores: number, increaseCores: number, reclaimableGiB: number, increaseGiB: number) => ({
  cpu: { reclaimableCores, increaseCores, netCores: reclaimableCores - increaseCores },
  memory: { reclaimableGiB, increaseGiB, netGiB: reclaimableGiB - increaseGiB },
});

const counts = {
  total: 7,
  included: 4,
  skippedNoAnalysis: 1,
  skippedNoReplicas: 1,
  skippedNoCurrentRequest: 1,
};

const savingsReport = {
  totals: amounts(1.5, 0.25, 2, 0.5),
  byCluster: [
    { cluster: '', tailorings: 1, ...amounts(0, 0.25, 0, 0.5) },
    { cluster: 'example-cluster', tailorings: 3, ...amounts(1.5, 0, 2, 0) },
  ],
  byNamespace: [
    { cluster: '', namespace: 'example-namespace', tailorings: 1, ...amounts(0, 0.25, 0, 0.5) },
    { cluster: 'example-cluster', namespace: 'example-namespace', tailorings: 2, ...amounts(1.45, 0, 1.8828125, 0) },
    { cluster: 'example-cluster', namespace: 'example-small', tailorings: 1, ...amounts(0.05, 0, 0.1171875, 0) },
  ],
  tailorings: counts,
};

describe('apiClient.getSavingsSummary', () => {
  test('requests the savings endpoint and keeps the server shape', async () => {
    analyticsResponse = () => Response.json({ success: true, data: savingsReport });
    const report = await apiClient.getSavingsSummary();
    expect(lastPath).toBe('/api/v1/analytics/savings');
    expect([...(lastQuery?.keys() ?? [])]).toEqual([]);
    expect(report).toEqual(savingsReport);
  });

  test('sends the price parameters the server reads, only when valid', async () => {
    analyticsResponse = () => Response.json({ success: true, data: savingsReport });
    await apiClient.getSavingsSummary({ cpuPricePerCoreHour: 0.03, memPricePerGiBHour: 0.004 });
    expect(lastQuery?.get('cpuPricePerCoreHour')).toBe('0.03');
    expect(lastQuery?.get('memPricePerGiBHour')).toBe('0.004');
    await apiClient.getSavingsSummary({ cpuPricePerCoreHour: -1, memPricePerGiBHour: NaN });
    expect([...(lastQuery?.keys() ?? [])]).toEqual([]);
  });

  test('keeps cost and pricing when the server priced the request', async () => {
    const cost = { reclaimablePerHour: 0.05, increasePerHour: 0.01, netPerHour: 0.04 };
    analyticsResponse = () =>
      Response.json({
        success: true,
        data: { ...savingsReport, totals: { ...savingsReport.totals, cost }, pricing: { cpuPricePerCoreHour: 0.03 } },
      });
    const report = await apiClient.getSavingsSummary({ cpuPricePerCoreHour: 0.03 });
    expect(report.totals.cost).toEqual(cost);
    expect(report.pricing).toEqual({ cpuPricePerCoreHour: 0.03, memPricePerGiBHour: undefined });
  });

  test('a plain 404 from a server without the endpoint is EndpointUnavailableError', async () => {
    analyticsResponse = () => new Response('404 page not found\n', { status: 404 });
    const err = await apiClient.getSavingsSummary().catch((e) => e);
    expect(err).toBeInstanceOf(EndpointUnavailableError);
  });

  test('a 404 with a JSON error is a regular error', async () => {
    analyticsResponse = () => Response.json({ success: false, error: 'no Atelier found' }, { status: 404 });
    const err = await apiClient.getSavingsSummary().catch((e) => e);
    expect(err).not.toBeInstanceOf(EndpointUnavailableError);
    expect(err.message).toBe('no Atelier found');
  });

  test.each([
    ['a JSON error', () => Response.json({ success: false, error: 'listing Tailorings failed' }, { status: 500 }), 'listing Tailorings failed'],
    ['an invalid price', () => Response.json({ success: false, error: 'invalid cpuPricePerCoreHour "x"' }, { status: 400 }), 'invalid cpuPricePerCoreHour "x"'],
    ['an empty body', () => new Response('', { status: 500 }), 'Savings request failed with status 500'],
    ['success: false with status 200', () => Response.json({ success: false, error: 'boom' }), 'boom'],
  ])('rejects with the server message for %s', async (_, response, message) => {
    analyticsResponse = response;
    const err = await apiClient.getSavingsSummary().catch((e) => e);
    expect(err).not.toBeInstanceOf(EndpointUnavailableError);
    expect(err.message).toBe(message);
  });

  test.each([
    ['no data', { success: true }],
    ['null data', { success: true, data: null }],
    ['an empty report', { success: true, data: { totals: amounts(0, 0, 0, 0), byCluster: [], byNamespace: [], tailorings: { total: 0 } } }],
    ['lists that are not lists', { success: true, data: { byCluster: 'nope', byNamespace: {} } }],
  ])('returns an empty report for %s', async (_, body) => {
    analyticsResponse = () => Response.json(body);
    const report = await apiClient.getSavingsSummary();
    expect(report.byCluster).toEqual([]);
    expect(report.byNamespace).toEqual([]);
    expect(report.totals).toEqual(amounts(0, 0, 0, 0));
    expect(report.tailorings).toEqual({ total: 0, included: 0, skippedNoAnalysis: 0, skippedNoReplicas: 0, skippedNoCurrentRequest: 0 });
  });
});

describe('normalizeSavings', () => {
  test('coerces malformed numbers and keeps negatives', () => {
    const report = normalizeSavings({
      totals: { cpu: { reclaimableCores: '0.5', increaseCores: 'x', netCores: -0.25 }, memory: { netGiB: Infinity } },
      byCluster: [{ cluster: 42, tailorings: -3 }, null],
      tailorings: { total: '2', included: 1.6 },
    });
    expect(report.totals).toEqual({
      cpu: { reclaimableCores: 0.5, increaseCores: 0, netCores: -0.25 },
      memory: { reclaimableGiB: 0, increaseGiB: 0, netGiB: 0 },
    });
    expect(report.byCluster.map((g) => [g.cluster, g.tailorings])).toEqual([['', 0], ['', 0]]);
    expect(report.byCluster[0].namespace).toBeUndefined();
    expect(report.tailorings.total).toBe(2);
    expect(report.tailorings.included).toBe(2);
  });

  test('marks byNamespace entries without a namespace with an empty one', () => {
    const report = normalizeSavings({ byNamespace: [{ cluster: 'example-cluster', namespace: '', tailorings: 1 }] });
    expect(report.byNamespace[0].namespace).toBe('');
  });

  test('keeps requested totals and net percentages, negative ones included', () => {
    const report = normalizeSavings({
      totals: {
        cpu: { reclaimableCores: 12.5, increaseCores: 1.25, netCores: 11.25, totalRequestedCores: 90, netPercent: 12.5 },
        memory: { reclaimableGiB: 0, increaseGiB: 3, netGiB: -3, totalRequestedGiB: 60, netPercent: -5 },
      },
      byNamespace: [
        { cluster: 'example-cluster', namespace: 'example-namespace', tailorings: 1, cpu: { totalRequestedCores: 0, netPercent: null } },
      ],
    });
    expect(report.totals.cpu).toEqual({ reclaimableCores: 12.5, increaseCores: 1.25, netCores: 11.25, totalRequestedCores: 90, netPercent: 12.5 });
    expect(report.totals.memory.netPercent).toBe(-5);
    expect(report.byNamespace[0].cpu.totalRequestedCores).toBe(0);
    expect(report.byNamespace[0].cpu.netPercent).toBeUndefined();
  });

  test.each([
    ['missing (older server)', {}],
    ['null', { totalRequestedCores: null, netPercent: null }],
    ['garbage', { totalRequestedCores: 'lots', netPercent: { value: 3 } }],
    ['infinite', { totalRequestedCores: Infinity, netPercent: -Infinity }],
    ['a negative total', { totalRequestedCores: -4 }],
  ])('leaves requested totals and percentages unset when %s', (_, cpu) => {
    const report = normalizeSavings({ totals: { cpu, memory: cpu } });
    expect(report.totals.cpu.totalRequestedCores).toBeUndefined();
    expect(report.totals.cpu.netPercent).toBeUndefined();
    expect(report.totals.memory.totalRequestedGiB).toBeUndefined();
    expect('totalRequestedCores' in report.totals.cpu).toBe(false);
  });
});

describe('apiClient.getTailoring', () => {
  test('returns the Tailoring with its status passed through', async () => {
    const scaling = { autoscalers: ['HorizontalPodAutoscaler/example-app'], reason: 'r' };
    tailoringResponse = () =>
      Response.json({
        success: true,
        data: {
          metadata: { name: 'example-app', namespace: 'example-namespace' },
          spec: { target: { kind: 'Deployment', name: 'example-app' }, fitProfileRef: { name: 'balanced' } },
          status: { scaling, autoscalers: [{ kind: 'HorizontalPodAutoscaler', name: 'example-app', minReplicas: 2 }] },
        },
      });
    const t = await apiClient.getTailoring('example-namespace', 'example-app');
    expect(lastPath).toBe('/api/v1/tailorings/example-namespace/example-app');
    expect(t.status.scaling).toEqual(scaling);
    expect(t.status.autoscalers?.[0].minReplicas).toBe(2);
    expect(t.spec.target).toEqual({ kind: 'Deployment', name: 'example-app', namespace: undefined, cluster: undefined });
  });

  test('gives a malformed Tailoring the structure the detail page reads', async () => {
    tailoringResponse = () =>
      Response.json({
        success: true,
        data: {
          metadata: { name: ['x'] },
          spec: { target: 'nope', fitProfileRef: null },
          status: {
            conditions: 'x',
            prState: { open: true },
            prNumber: 'NaN',
            lastAnalysis: {
              containers: [null, 'x', { name: 'app', current: { requests: { cpu: 0.5, memory: { a: 1 } } }, recommended: 'x', p95CPU: [] }],
            },
          },
        },
      });
    const t = await apiClient.getTailoring('example-namespace', 'example-app');
    expect(t.metadata.name).toBe('');
    expect(t.spec.target.kind).toBe('');
    expect(t.spec.fitProfileRef.name).toBe('');
    expect(t.status.conditions).toEqual([]);
    expect(t.status.prState).toBeUndefined();
    expect(t.status.prNumber).toBeUndefined();
    expect(t.status.lastAnalysis?.containers).toHaveLength(1);
    const c = t.status.lastAnalysis!.containers![0];
    expect(c.current?.requests).toEqual({ cpu: '0.5', memory: undefined });
    expect(c.recommended).toEqual({ requests: undefined, limits: undefined });
    expect(c.p95CPU).toBeUndefined();
  });

  test('drops a lastAnalysis that is not an object and fills in a missing status', async () => {
    tailoringResponse = () => Response.json({ success: true, data: { metadata: {}, spec: {}, status: { lastAnalysis: 'yesterday' } } });
    expect((await apiClient.getTailoring('example-namespace', 'example-app')).status.lastAnalysis).toBeUndefined();
    tailoringResponse = () => Response.json({ success: true, data: { metadata: {} } });
    expect((await apiClient.getTailoring('example-namespace', 'example-app')).status.conditions).toEqual([]);
  });

  test.each([
    ['no data', { success: true }],
    ['a list', { success: true, data: [] }],
    ['a string', { success: true, data: 'x' }],
  ])('rejects %s', async (_, body) => {
    tailoringResponse = () => Response.json(body);
    await expect(apiClient.getTailoring('example-namespace', 'example-app')).rejects.toThrow('Tailoring not found');
  });
});

describe('apiClient.getTopGains', () => {
  const gain = (container: string, cpuSavingCores?: number, memorySavingGiB?: number) => ({
    cluster: 'example-cluster',
    namespace: 'example-namespace',
    tailoring: 'example-app',
    workloadKind: 'Deployment',
    workloadName: 'example-app',
    workloadNamespace: 'example-namespace',
    container,
    replicas: 3,
    currentRequests: { cpu: '500m', memory: '512Mi' },
    recommendedRequests: { cpu: '200m', memory: '256Mi' },
    ...(cpuSavingCores === undefined ? {} : { cpuSavingCores }),
    ...(memorySavingGiB === undefined ? {} : { memorySavingGiB }),
  });
  const topGains = { limit: 5, byCPU: [gain('app', 0.9, 0.75)], byMemory: [gain('app', 0.9, 0.75), gain('cache', undefined, 2)], tailorings: counts };

  test('sends the limit and keeps the server shape', async () => {
    analyticsResponse = () => Response.json({ success: true, data: topGains });
    const report = await apiClient.getTopGains(5);
    expect(lastPath).toBe('/api/v1/analytics/top-gains');
    expect(lastQuery?.get('limit')).toBe('5');
    expect(report.limit).toBe(5);
    expect(report.tailorings).toEqual(counts);
    expect(report.byCPU).toEqual([gain('app', 0.9, 0.75)]);
    expect(report.byMemory[1].cpuSavingCores).toBeUndefined();
    expect(report.byMemory[1].memorySavingGiB).toBe(2);
  });

  test.each([
    [0, '1'],
    [2.7, '2'],
    [1000, '200'],
    [NaN, '10'],
  ])('keeps limit %p within what the server accepts (%s)', async (limit, sent) => {
    analyticsResponse = () => Response.json({ success: true, data: topGains });
    await apiClient.getTopGains(limit);
    expect(lastQuery?.get('limit')).toBe(sent);
  });

  test.each([
    ['null', null],
    ['an object without lists', { foo: 1 }],
    ['lists that are not lists', { byCPU: 'x', byMemory: null }],
  ])('returns no gains for %s', (_, raw) => {
    const report = normalizeTopGains(raw);
    expect(report.byCPU).toEqual([]);
    expect(report.byMemory).toEqual([]);
  });

  test('drops non-numeric savings and empty request values', () => {
    const [g] = normalizeTopGains({ byCPU: [{ ...gain('app'), cpuSavingCores: 'lots', currentRequests: { cpu: '' } }] }).byCPU;
    expect(g.cpuSavingCores).toBeUndefined();
    expect(g.currentRequests).toEqual({ cpu: undefined, memory: undefined });
  });

  test('a plain 404 is EndpointUnavailableError', async () => {
    analyticsResponse = () => new Response('404 page not found\n', { status: 404 });
    expect(await apiClient.getTopGains().catch((e) => e)).toBeInstanceOf(EndpointUnavailableError);
  });
});

describe('tailoringAnalysisState', () => {
  const summary = {
    name: 'example-app',
    namespace: 'example-namespace',
    targetKind: 'Deployment',
    targetName: 'example-app',
    paused: false,
    targetFound: false,
    vpaDetected: false,
    containerCount: 0,
    readyCondition: 'False',
  };

  test('reads the Analyzed condition fields', () => {
    expect(
      tailoringAnalysisState({
        ...summary,
        analyzedCondition: 'False',
        analyzedReason: 'TargetNotFound',
        analyzedMessage: 'Deployment example-namespace/example-app not found',
        nextAnalysisTime: '2026-01-01T00:05:00Z',
        consecutiveFailures: 3,
      }),
    ).toEqual({
      status: 'False',
      reason: 'TargetNotFound',
      message: 'Deployment example-namespace/example-app not found',
      nextAnalysisTime: new Date('2026-01-01T00:05:00Z'),
      consecutiveFailures: 3,
    });
  });

  test('handles a summary from an older server', () => {
    expect(tailoringAnalysisState(summary)).toEqual({
      status: undefined,
      reason: undefined,
      message: undefined,
      nextAnalysisTime: undefined,
      consecutiveFailures: 0,
    });
  });

  test('ignores unparseable times, bogus counts and blank strings', () => {
    const state = tailoringAnalysisState({ ...summary, analyzedCondition: ' ', nextAnalysisTime: 'soon', consecutiveFailures: -2, analyzedReason: '  ' });
    expect(state.status).toBeUndefined();
    expect(state.nextAnalysisTime).toBeUndefined();
    expect(state.consecutiveFailures).toBe(0);
    expect(state.reason).toBeUndefined();
  });
});
