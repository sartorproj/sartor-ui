import { afterAll, describe, expect, test } from 'bun:test';
import { AxiosError } from 'axios';

let lastQuery: URLSearchParams | undefined;
let lastPath: string | undefined;
// Response for /api/v1/prometheus/forecast; every other path answers like the metrics endpoint.
let forecastResponse: () => Response = () => Response.json({ success: true, data: {} });
// Responses for the analytics endpoints, keyed by path.
const analyticsResponses: Record<string, () => Response> = {};
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    lastQuery = url.searchParams;
    lastPath = url.pathname;
    if (url.pathname === '/api/v1/prometheus/forecast') return forecastResponse();
    const analytics = analyticsResponses[url.pathname];
    if (analytics) return analytics();
    return Response.json({ success: true, data: [{ timestamp: 1, value: 2 }] });
  },
});
afterAll(() => {
  server.stop(true);
});

// Other test files may load the module first, so the base URL is set on the client
// instance rather than through VITE_API_URL, which is only read at load time.
const {
  default: api,
  ANALYTICS_ENDPOINTS,
  apiClient,
  EndpointUnavailableError,
  ForecastUnavailableError,
  forecastError,
  forecastParams,
  normalizeSavingsReport,
  normalizeTopGains,
  prometheusMetricsParams,
  tailoringAnalysisStatus,
  tailoringMetricsTarget,
} = await import('./api');
api.defaults.baseURL = server.url.origin;
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

const namespaceSavings = (namespace: string, cpu: number, memory: number, included = 1, skipped = 0) => ({
  namespace,
  reclaimableCpuCores: cpu,
  neededCpuCores: 0.1,
  reclaimableMemoryGiB: memory,
  neededMemoryGiB: 0.25,
  included,
  skipped,
});

describe('normalizeSavingsReport', () => {
  test('keeps cluster and namespace totals as sent', () => {
    const report = normalizeSavingsReport({
      clusters: [
        {
          cluster: 'example-cluster',
          reclaimableCpuCores: 3,
          neededCpuCores: 0.2,
          reclaimableMemoryGiB: 6,
          neededMemoryGiB: 0.5,
          included: 4,
          skipped: 1,
          namespaces: [namespaceSavings('example-namespace', 2, 4, 3, 1), namespaceSavings('example-other', 1, 2)],
        },
      ],
    });
    expect(report.clusters).toHaveLength(1);
    expect(report.clusters[0]).toMatchObject({ cluster: 'example-cluster', reclaimableCpuCores: 3, included: 4, skipped: 1 });
    expect(report.clusters[0].namespaces.map((ns) => ns.namespace)).toEqual(['example-namespace', 'example-other']);
    expect(report.total).toEqual({
      reclaimableCpuCores: 3,
      neededCpuCores: 0.2,
      reclaimableMemoryGiB: 6,
      neededMemoryGiB: 0.5,
      included: 4,
      skipped: 1,
    });
  });

  test('sums namespaces for a cluster without totals and clusters for a report without totals', () => {
    const report = normalizeSavingsReport({
      clusters: [
        { cluster: 'example-a', namespaces: [namespaceSavings('example-namespace', 1, 2, 2, 1), namespaceSavings('example-b', 0.5, 1)] },
        { cluster: 'example-b', namespaces: [namespaceSavings('example-namespace', 0.25, 0.5)] },
      ],
    });
    expect(report.clusters[0]).toMatchObject({ reclaimableCpuCores: 1.5, neededCpuCores: 0.2, included: 3, skipped: 1 });
    expect(report.total).toMatchObject({ reclaimableCpuCores: 1.75, reclaimableMemoryGiB: 3.5, included: 4, skipped: 1 });
  });

  test('prefers the server total and its counts over sums', () => {
    const report = normalizeSavingsReport({
      clusters: [{ cluster: 'example-cluster', namespaces: [namespaceSavings('example-namespace', 1, 1)] }],
      total: { reclaimableCpuCores: 9, neededCpuCores: 0, reclaimableMemoryGiB: 9, neededMemoryGiB: 0 },
      included: 7,
      skipped: 5,
    });
    expect(report.total).toMatchObject({ reclaimableCpuCores: 9, included: 7, skipped: 5 });
  });

  test('accepts other capitalisations of the field names', () => {
    const report = normalizeSavingsReport({
      clusters: [{ cluster: 'example-cluster', reclaimableCPUCores: 2, neededCPUCores: 1, reclaimableMemoryGib: 3, NeededMemoryGiB: 4 }],
    });
    expect(report.clusters[0]).toMatchObject({ reclaimableCpuCores: 2, neededCpuCores: 1, reclaimableMemoryGiB: 3, neededMemoryGiB: 4 });
  });

  test('keeps an empty cluster name, negative totals and costs', () => {
    const report = normalizeSavingsReport({
      clusters: [{ cluster: '', reclaimableCpuCores: -0.5, reclaimableCost: 12.5, neededCost: 1, namespaces: [] }],
      currency: 'USD',
    });
    expect(report.clusters[0].cluster).toBe('');
    expect(report.clusters[0].reclaimableCpuCores).toBe(-0.5);
    expect(report.total).toMatchObject({ reclaimableCpuCores: -0.5, reclaimableCost: 12.5, neededCost: 1 });
    expect(report.currency).toBe('USD');
  });

  test('leaves cost out when the server sends none', () => {
    const report = normalizeSavingsReport({ clusters: [{ cluster: 'example-cluster', namespaces: [namespaceSavings('example-namespace', 1, 1)] }] });
    expect('reclaimableCost' in report.total).toBe(false);
    expect('reclaimableCost' in report.clusters[0]).toBe(false);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'nope'],
    ['an empty object', {}],
    ['clusters that are not objects', { clusters: [null, 1, 'x'] }],
  ])('returns an empty report for %s', (_, data) => {
    const report = normalizeSavingsReport(data);
    expect(report.clusters).toEqual([]);
    expect(report.total).toMatchObject({ reclaimableCpuCores: 0, included: 0, skipped: 0 });
  });

  test('accepts a bare list of clusters', () => {
    expect(normalizeSavingsReport([{ cluster: 'example-cluster', namespaces: [] }]).clusters).toHaveLength(1);
  });

  test('turns non-numeric values into zero instead of NaN', () => {
    const report = normalizeSavingsReport({
      clusters: [{ cluster: 'example-cluster', reclaimableCpuCores: 'lots', neededCpuCores: null, namespaces: [{ namespace: 'example-namespace', reclaimableCpuCores: Infinity }] }],
    });
    expect(report.clusters[0].reclaimableCpuCores).toBe(0);
    expect(report.clusters[0].neededCpuCores).toBe(0);
    expect(report.clusters[0].namespaces[0].reclaimableCpuCores).toBe(0);
  });
});

const gain = (tailoring: string, cpu: number, memory: number) => ({
  cluster: 'example-cluster',
  namespace: 'example-namespace',
  tailoring,
  container: 'app',
  replicas: 2,
  reclaimableCpuCores: cpu,
  reclaimableMemoryGiB: memory,
});

describe('normalizeTopGains', () => {
  test('ranks one list by each resource and drops entries without a gain', () => {
    const gains = normalizeTopGains([gain('example-a', 0.5, 0), gain('example-b', 2, 1), gain('example-c', -1, 4)]);
    expect(gains.cpu.map((g) => g.tailoring)).toEqual(['example-b', 'example-a']);
    expect(gains.memory.map((g) => g.tailoring)).toEqual(['example-c', 'example-b']);
  });

  test('uses separate lists per resource', () => {
    const gains = normalizeTopGains({ cpu: [gain('example-a', 1, 0)], memory: [gain('example-b', 0, 1)] });
    expect(gains.cpu.map((g) => g.tailoring)).toEqual(['example-a']);
    expect(gains.memory.map((g) => g.tailoring)).toEqual(['example-b']);
  });

  test('applies the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => gain(`example-${i}`, i + 1, i + 1));
    expect(normalizeTopGains(many, 5).cpu).toHaveLength(5);
    expect(normalizeTopGains(many, 5).cpu[0].tailoring).toBe('example-29');
  });

  test('reads alternative name fields and keeps optional details', () => {
    const [entry] = normalizeTopGains([
      { namespace: 'example-namespace', tailoringName: 'example-a', containerName: 'app', reclaimableCPUCores: 1, currentCpuCores: 2, recommendedCpuCores: 1.5, replicas: 2 },
    ]).cpu;
    expect(entry).toMatchObject({ tailoring: 'example-a', container: 'app', currentCpuCores: 2, recommendedCpuCores: 1.5, replicas: 2 });
    expect('currentMemoryGiB' in entry).toBe(false);
  });

  test.each([
    ['null', null],
    ['an empty list', []],
    ['an empty object', {}],
    ['a string', 'nope'],
  ])('returns no gains for %s', (_, data) => {
    expect(normalizeTopGains(data)).toEqual({ cpu: [], memory: [] });
  });
});

describe('apiClient analytics endpoints', () => {
  test('getSavingsReport reads the savings endpoint', async () => {
    analyticsResponses[ANALYTICS_ENDPOINTS.savings] = () =>
      Response.json({ success: true, data: { clusters: [{ cluster: 'example-cluster', namespaces: [namespaceSavings('example-namespace', 1, 2)] }] } });
    const report = await apiClient.getSavingsReport();
    expect(lastPath).toBe(ANALYTICS_ENDPOINTS.savings);
    expect(report.total.reclaimableCpuCores).toBe(1);
  });

  test('getSavingsReport returns an empty report for empty data', async () => {
    analyticsResponses[ANALYTICS_ENDPOINTS.savings] = () => Response.json({ success: true, data: { clusters: [] } });
    expect((await apiClient.getSavingsReport()).clusters).toEqual([]);
    analyticsResponses[ANALYTICS_ENDPOINTS.savings] = () => Response.json({ success: true });
    expect((await apiClient.getSavingsReport()).clusters).toEqual([]);
  });

  test('getSavingsReport reports an older server as unavailable', async () => {
    analyticsResponses[ANALYTICS_ENDPOINTS.savings] = () => new Response('404 page not found\n', { status: 404 });
    const err = await apiClient.getSavingsReport().catch((e) => e);
    expect(err).toBeInstanceOf(EndpointUnavailableError);
    expect(err.message).toContain('newer Sartor server');
  });

  test('getSavingsReport shows the server message for a 404 with a JSON error', async () => {
    analyticsResponses[ANALYTICS_ENDPOINTS.savings] = () => Response.json({ success: false, error: 'no Atelier' }, { status: 404 });
    const err = await apiClient.getSavingsReport().catch((e) => e);
    expect(err).not.toBeInstanceOf(EndpointUnavailableError);
    expect(err.message).toBe('no Atelier');
  });

  test.each([
    ['a 500 with a message', () => Response.json({ success: false, error: 'list failed' }, { status: 500 }), 'list failed'],
    ['a 500 without a message', () => new Response('', { status: 500 }), 'Savings request failed with status 500'],
    ['success false', () => Response.json({ success: false, error: 'boom' }), 'boom'],
    ['an HTML 200', () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }), 'unexpected response'],
  ])('getSavingsReport fails for %s', async (_, response, message) => {
    analyticsResponses[ANALYTICS_ENDPOINTS.savings] = response;
    const err = await apiClient.getSavingsReport().catch((e) => e);
    expect(err).not.toBeInstanceOf(EndpointUnavailableError);
    expect(err.message).toContain(message);
  });

  test('getTopGains sends the limit', async () => {
    analyticsResponses[ANALYTICS_ENDPOINTS.topGains] = () => Response.json({ success: true, data: [gain('example-a', 1, 1)] });
    const gains = await apiClient.getTopGains(5);
    expect(lastPath).toBe(ANALYTICS_ENDPOINTS.topGains);
    expect(lastQuery?.get('limit')).toBe('5');
    expect(gains.cpu).toHaveLength(1);
  });

  test('getTopGains reports an older server as unavailable', async () => {
    analyticsResponses[ANALYTICS_ENDPOINTS.topGains] = () => new Response('404 page not found\n', { status: 404 });
    await expect(apiClient.getTopGains()).rejects.toBeInstanceOf(EndpointUnavailableError);
  });

  test('getTopGains returns no gains for empty data', async () => {
    analyticsResponses[ANALYTICS_ENDPOINTS.topGains] = () => Response.json({ success: true, data: [] });
    expect(await apiClient.getTopGains()).toEqual({ cpu: [], memory: [] });
  });
});

type Summary = import('./api').TailoringSummary;

const summary = (fields: Partial<Summary> = {}): Summary => ({
  name: 'example-tailoring',
  namespace: 'example-namespace',
  targetKind: 'Deployment',
  targetName: 'example-app',
  paused: false,
  targetFound: true,
  vpaDetected: false,
  containerCount: 1,
  readyCondition: 'True',
  ...fields,
});

describe('tailoringAnalysisStatus', () => {
  test('is pending without any condition or analysis', () => {
    expect(tailoringAnalysisStatus(summary())).toEqual({ state: 'pending', consecutiveFailures: 0, lastAnalysis: undefined, nextAnalysis: undefined, reason: undefined, message: undefined });
  });

  test('is analyzed with a last analysis on a server without the condition fields', () => {
    const status = tailoringAnalysisStatus(summary({ lastAnalysis: '2026-01-01T00:00:00Z' }));
    expect(status.state).toBe('analyzed');
    expect(status.lastAnalysis?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  test('is failing with a False condition, even with an earlier analysis', () => {
    const status = tailoringAnalysisStatus(
      summary({
        lastAnalysis: '2026-01-01T00:00:00Z',
        analyzedCondition: 'False',
        analyzedReason: ' TargetNotFound ',
        analyzedMessage: 'deployments.apps "example-app" not found',
        nextAnalysisTime: '2026-01-01T00:05:00Z',
        consecutiveFailures: 3,
      }),
    );
    expect(status).toMatchObject({ state: 'failing', reason: 'TargetNotFound', consecutiveFailures: 3 });
    expect(status.message).toContain('not found');
    expect(status.nextAnalysis?.toISOString()).toBe('2026-01-01T00:05:00.000Z');
  });

  test('is failing with failures counted but no condition', () => {
    expect(tailoringAnalysisStatus(summary({ consecutiveFailures: 2 })).state).toBe('failing');
  });

  test('is analyzed when the condition is True despite a stale failure count', () => {
    expect(tailoringAnalysisStatus(summary({ analyzedCondition: 'True', consecutiveFailures: 2 })).state).toBe('analyzed');
  });

  test('is pending with an Unknown condition and no analysis', () => {
    expect(tailoringAnalysisStatus(summary({ analyzedCondition: 'Unknown' })).state).toBe('pending');
  });

  test('ignores unparseable times, empty strings and odd failure counts', () => {
    const status = tailoringAnalysisStatus(
      summary({ lastAnalysis: 'yesterday', nextAnalysisTime: '', analyzedReason: '  ', consecutiveFailures: -1 }),
    );
    expect(status).toMatchObject({ state: 'pending', consecutiveFailures: 0 });
    expect(status.lastAnalysis).toBeUndefined();
    expect(status.nextAnalysis).toBeUndefined();
    expect(status.reason).toBeUndefined();
  });
});
