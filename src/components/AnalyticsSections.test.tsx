import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { EndpointUnavailableError, normalizeSavings, normalizeTopGains, type SavingsReport, type TopGainsReport } from '@/lib/api';
import type { QueryView } from '@/lib/analytics';
import { SAVINGS_UNAVAILABLE_NOTE, SavingsSummaryView } from './SavingsSummary';
import { TOP_GAINS_UNAVAILABLE_NOTE, TopGainsView } from './TopGains';
import { OpenCostGate } from './OpenCostGate';

// Shapes as returned by the server's /api/v1/analytics endpoints.
const amounts = (reclaimableCores: number, increaseCores: number, reclaimableGiB: number, increaseGiB: number) => ({
  cpu: { reclaimableCores, increaseCores, netCores: reclaimableCores - increaseCores },
  memory: { reclaimableGiB, increaseGiB, netGiB: reclaimableGiB - increaseGiB },
});

const counts = (included: number, skipped: Partial<Record<'skippedNoAnalysis' | 'skippedNoReplicas' | 'skippedNoCurrentRequest', number>> = {}) => {
  const c = { skippedNoAnalysis: 0, skippedNoReplicas: 0, skippedNoCurrentRequest: 0, ...skipped };
  return { total: included + c.skippedNoAnalysis + c.skippedNoReplicas + c.skippedNoCurrentRequest, included, ...c };
};

const savings = normalizeSavings({
  totals: amounts(0.05, 0.75, 120 / 1024, 0.5),
  byCluster: [
    { cluster: '', tailorings: 1, ...amounts(0, 0.5, 0, 0.25) },
    { cluster: 'example-cluster', tailorings: 3, ...amounts(0.05, 0.25, 120 / 1024, 0.25) },
  ],
  byNamespace: [
    { cluster: '', namespace: '', tailorings: 1, ...amounts(0, 0.5, 0, 0.25) },
    { cluster: 'example-cluster', namespace: 'example-namespace', tailorings: 3, ...amounts(0.05, 0.25, 120 / 1024, 0.25) },
  ],
  tailorings: counts(4, { skippedNoAnalysis: 2, skippedNoCurrentRequest: 1 }),
});

const renderSavings = (query: QueryView<SavingsReport>, defaultExpanded = false) =>
  renderToStaticMarkup(<SavingsSummaryView query={query} defaultExpanded={defaultExpanded} />);

describe('SavingsSummaryView', () => {
  test('shows a short note instead of the section on an older server', () => {
    const html = renderSavings({ isLoading: false, error: new EndpointUnavailableError() });
    expect(html).toContain(SAVINGS_UNAVAILABLE_NOTE);
    expect(html).not.toContain('Right-sizing savings');
    expect(html).not.toContain('<table');
  });

  test('shows the error message for a failed request', () => {
    const html = renderSavings({ isLoading: false, error: new Error('listing Tailorings failed'), refetch: () => {} });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Could not load savings: listing Tailorings failed');
    expect(html).toContain('Retry');
  });

  test('shows a loading state', () => {
    expect(renderSavings({ isLoading: true })).toContain('Loading savings');
  });

  test('explains an empty result but keeps the counts per skip reason', () => {
    const html = renderSavings({
      isLoading: false,
      data: normalizeSavings({ byCluster: [], byNamespace: [], tailorings: counts(0, { skippedNoAnalysis: 3, skippedNoReplicas: 1 }) }),
    });
    expect(html).toContain('No savings to show yet');
    expect(html).toContain('0 of 4 Tailorings included');
    expect(html).toContain('3 skipped: not analyzed yet');
    expect(html).toContain('1 skipped: no replica count');
    expect(html).not.toContain('no current request');
    expect(html).not.toContain('<table');
  });

  test('renders totals and clusters with small, negative net and unnamed values', () => {
    const html = renderSavings({ isLoading: false, data: savings });
    expect(html).toContain('4 of 7 Tailorings included');
    expect(html).toContain('2 skipped: not analyzed yet');
    expect(html).toContain('1 skipped: no current request');
    expect(html).toContain('example-cluster');
    expect(html).toContain('(default)');
    expect(html).toContain('0.05 cores');
    expect(html).toContain('120 MiB');
    expect(html).toContain('Net -0.7 cores');
    expect(html).toContain('Net -392 MiB');
    expect(html).toContain('-0.2 cores');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('example-namespace');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Net cost');
  });

  test('expands clusters to the namespaces from byNamespace', () => {
    const html = renderSavings({ isLoading: false, data: savings }, true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('example-namespace');
    expect(html).toContain('(no namespace)');
  });

  test('shows hourly cost only when the server priced the request', () => {
    const cost = { reclaimablePerHour: 0.5, increasePerHour: 0.125, netPerHour: 0.375 };
    const data = normalizeSavings({
      totals: { ...amounts(1, 0, 1, 0), cost },
      byCluster: [{ cluster: 'example-cluster', tailorings: 1, ...amounts(1, 0, 1, 0), cost }],
      byNamespace: [],
      tailorings: counts(1),
      pricing: { cpuPricePerCoreHour: 0.5 },
    });
    const html = renderSavings({ isLoading: false, data });
    expect(html).toContain('Net cost');
    expect(html).toContain('0.38/h');
    expect(html).toContain('0.5/h reclaimable');
  });
});

const gain = (container: string, cpuSavingCores?: number, memorySavingGiB?: number, overrides: Record<string, unknown> = {}) => ({
  cluster: '',
  namespace: 'example-namespace',
  tailoring: 'example-app',
  workloadKind: 'Deployment',
  workloadName: 'example-app',
  workloadNamespace: 'example-namespace',
  container,
  replicas: 3,
  currentRequests: { cpu: '1', memory: '1Gi' },
  recommendedRequests: { cpu: '500m', memory: '1Gi' },
  cpuSavingCores,
  memorySavingGiB,
  ...overrides,
});

const topGains = normalizeTopGains({
  limit: 10,
  byCPU: [
    gain('app', 1.5, 0.0001),
    gain('worker', 0.25, -0.5, { tailoring: 'example-worker', workloadNamespace: 'example-workloads', workloadName: 'example-worker' }),
  ],
  byMemory: [gain('cache', undefined, 4, { tailoring: 'example-cache', currentRequests: { memory: '2Gi' }, recommendedRequests: { memory: '640Mi' } })],
  tailorings: counts(3),
});

const renderGains = (query: QueryView<TopGainsReport>, defaultResource: 'cpu' | 'memory' = 'cpu') =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TopGainsView query={query} defaultResource={defaultResource} />
    </MemoryRouter>,
  );

describe('TopGainsView', () => {
  test('lists byCPU, linking to the Tailoring by namespace and name', () => {
    const html = renderGains({ isLoading: false, data: topGains });
    expect(html).toContain('href="/tailorings/example-namespace/example-app"');
    expect(html).toContain('href="/tailorings/example-namespace/example-worker"');
    expect(html).toContain('1.5 cores');
    expect(html).toContain('1 → 500m');
    expect(html).toContain('&lt; 1 MiB');
    expect(html).toContain('-512 MiB');
    expect(html).toContain('Deployment example-workloads/example-worker');
    expect(html).not.toContain('example-cache');
    expect(html).toContain('aria-pressed="true"');
    expect(html.indexOf('example-app"')).toBeLessThan(html.indexOf('example-worker"'));
  });

  test('lists byMemory', () => {
    const html = renderGains({ isLoading: false, data: topGains }, 'memory');
    expect(html).toContain('href="/tailorings/example-namespace/example-cache"');
    expect(html).toContain('4 GiB');
    expect(html).toContain('2Gi → 640Mi');
    expect(html).toContain('Reclaimable memory');
    expect(html).not.toContain('example-worker');
  });

  test('explains an empty result', () => {
    expect(renderGains({ isLoading: false, data: normalizeTopGains({ byCPU: [], byMemory: [], tailorings: counts(0) }) })).toContain(
      'No gains to show yet',
    );
  });

  test('explains when nothing is reclaimable for the chosen resource', () => {
    const data = normalizeTopGains({ byCPU: [], byMemory: [gain('app', undefined, 2)], tailorings: counts(1) });
    expect(renderGains({ isLoading: false, data })).toContain('No container has reclaimable CPU');
  });

  test('shows the cluster column only when a cluster is named', () => {
    expect(renderGains({ isLoading: false, data: topGains })).not.toContain('>Cluster<');
    const data = normalizeTopGains({ byCPU: [gain('app', 1, 0, { cluster: 'example-cluster' })], tailorings: counts(1) });
    expect(renderGains({ isLoading: false, data })).toContain('example-cluster');
  });

  test('shows a short note on an older server and the message on errors', () => {
    expect(renderGains({ isLoading: false, error: new EndpointUnavailableError() })).toContain(TOP_GAINS_UNAVAILABLE_NOTE);
    expect(renderGains({ isLoading: false, error: new Error('boom') })).toContain('Could not load biggest gains: boom');
  });
});

describe('OpenCostGate', () => {
  const gate = (health: Parameters<typeof OpenCostGate>[0]['health']) =>
    renderToStaticMarkup(
      <OpenCostGate health={health}>
        <p>opencost panels</p>
      </OpenCostGate>,
    );

  test('renders the panels when OpenCost is healthy', () => {
    const html = gate({ isLoading: false, data: { enabled: true, connected: true } });
    expect(html).toContain('opencost panels');
    expect(html).not.toContain('OpenCost Integration Required');
  });

  test.each([
    ['not enabled', { isLoading: false, data: { enabled: false, connected: false } }, 'not enabled'],
    ['disconnected', { isLoading: false, data: { enabled: true, connected: false, error: 'dial tcp: refused' } }, 'dial tcp: refused'],
    ['health request failed', { isLoading: false, error: new Error('Request failed with status code 500') }, 'Unable to check OpenCost status'],
  ])('shows the requirement instead of the panels when %s', (_, health, text) => {
    const html = gate(health);
    expect(html).toContain('OpenCost Integration Required');
    expect(html).toContain(text);
    expect(html).not.toContain('opencost panels');
  });

  test('shows a loading state while checking', () => {
    const html = gate({ isLoading: true });
    expect(html).toContain('Checking OpenCost');
    expect(html).not.toContain('opencost panels');
    expect(html).not.toContain('OpenCost Integration Required');
  });
});
