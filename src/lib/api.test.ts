import { afterAll, describe, expect, test } from 'bun:test';

let lastQuery: URLSearchParams | undefined;
const server = Bun.serve({
  port: 0,
  fetch(req) {
    lastQuery = new URL(req.url).searchParams;
    return Response.json({ success: true, data: [{ timestamp: 1, value: 2 }] });
  },
});
afterAll(() => {
  server.stop(true);
});

// The API base URL is read when the module loads, so import it after the stub server is up.
process.env.VITE_API_URL = server.url.origin;
const { apiClient, prometheusMetricsParams } = await import('./api');

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
