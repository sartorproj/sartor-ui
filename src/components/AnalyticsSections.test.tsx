import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { EndpointUnavailableError, normalizeSavings, type TopGain } from '@/lib/api';
import type { QueryView } from '@/lib/analytics';
import { SAVINGS_UNAVAILABLE_NOTE, SavingsSummaryView } from './SavingsSummary';
import { TOP_GAINS_UNAVAILABLE_NOTE, TopGainsView } from './TopGains';
import { OpenCostGate } from './OpenCostGate';

const amounts = (cpu: number, mem: number, neededCpu = 0, neededMem = 0, included = 1, skipped = 0) => ({
  reclaimableCpuCores: cpu,
  reclaimableMemoryGiB: mem,
  neededCpuCores: neededCpu,
  neededMemoryGiB: neededMem,
  included,
  skipped,
});

const savings = normalizeSavings({
  clusters: [
    {
      cluster: 'example-cluster',
      ...amounts(0.05, 120 / 1024, 0.25, 0.5, 3, 1),
      namespaces: [{ namespace: 'example-namespace', ...amounts(0.05, 120 / 1024, 0.25, 0.5, 3, 1) }],
    },
    { cluster: '', ...amounts(-0.5, -0.25, 0, 0, 1, 0), namespaces: [{ namespace: '', ...amounts(-0.5, -0.25) }] },
  ],
});

const renderSavings = (query: QueryView<ReturnType<typeof normalizeSavings>>, defaultExpanded = false) =>
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

  test('explains an empty result but keeps the counts', () => {
    const html = renderSavings({ isLoading: false, data: normalizeSavings({ clusters: [], skipped: 4 }) });
    expect(html).toContain('No savings to show yet');
    expect(html).toContain('4 skipped');
    expect(html).not.toContain('<table');
  });

  test('renders totals and clusters with small, negative and unnamed values', () => {
    const html = renderSavings({ isLoading: false, data: savings });
    expect(html).toContain('example-cluster');
    expect(html).toContain('(default)');
    expect(html).toContain('-0.45 cores');
    expect(html).toContain('-136 MiB');
    expect(html).toContain('0.05 cores');
    expect(html).toContain('120 MiB');
    expect(html).toContain('-0.5 cores');
    expect(html).toContain('4 included');
    expect(html).toContain('1 skipped');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('example-namespace');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Est. cost');
  });

  test('expands clusters to namespaces', () => {
    const html = renderSavings({ isLoading: false, data: savings }, true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('example-namespace');
    expect(html).toContain('(no namespace)');
  });

  test('shows cost only when the server returned it', () => {
    const data = normalizeSavings({
      clusters: [{ cluster: 'example-cluster', ...amounts(1, 1), cost: { currency: 'USD', period: 'month', reclaimable: 21.9, needed: 0 } }],
    });
    const html = renderSavings({ isLoading: false, data });
    expect(html).toContain('Est. cost');
    expect(html).toContain('$21.90/month');
  });
});

const gain = (overrides: Partial<TopGain>): TopGain => ({
  cluster: '',
  namespace: 'example-namespace',
  tailoring: 'example-app',
  container: 'app',
  replicas: 3,
  reclaimableCpuCores: 0,
  reclaimableMemoryGiB: 0,
  ...overrides,
});

const renderGains = (query: QueryView<TopGain[]>, defaultResource: 'cpu' | 'memory' = 'cpu') =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TopGainsView query={query} defaultResource={defaultResource} />
    </MemoryRouter>,
  );

describe('TopGainsView', () => {
  const gains = [
    gain({ container: 'app', reclaimableCpuCores: 1.5, reclaimableMemoryGiB: 0.0001 }),
    gain({ container: 'cache', tailoring: 'example-cache', reclaimableCpuCores: 0, reclaimableMemoryGiB: 4 }),
    gain({ container: 'orphan', tailoring: undefined, targetName: 'example-job', reclaimableCpuCores: 0.25 }),
  ];

  test('ranks by CPU, links to the Tailoring and hides entries without CPU gains', () => {
    const html = renderGains({ isLoading: false, data: gains });
    expect(html).toContain('href="/tailorings/example-namespace/example-app"');
    expect(html).toContain('1.5 cores');
    expect(html).toContain('&lt; 1 MiB');
    expect(html).toContain('example-namespace/example-job');
    expect(html).not.toContain('href="/tailorings/example-namespace/example-job"');
    expect(html).not.toContain('example-cache');
    expect(html).toContain('aria-pressed="true"');
    expect(html.indexOf('>app<')).toBeLessThan(html.indexOf('>orphan<'));
  });

  test('ranks by memory', () => {
    const html = renderGains({ isLoading: false, data: gains }, 'memory');
    expect(html).toContain('href="/tailorings/example-namespace/example-cache"');
    expect(html).toContain('4 GiB');
    expect(html).toContain('Reclaimable memory');
  });

  test('explains an empty result', () => {
    expect(renderGains({ isLoading: false, data: [] })).toContain('No gains to show yet');
  });

  test('explains when nothing is reclaimable for the chosen resource', () => {
    const html = renderGains({ isLoading: false, data: [gain({ reclaimableCpuCores: -1, reclaimableMemoryGiB: 2 })] });
    expect(html).toContain('No container has reclaimable CPU');
  });

  test('shows the cluster column only when a cluster is named', () => {
    expect(renderGains({ isLoading: false, data: gains })).not.toContain('>Cluster<');
    expect(renderGains({ isLoading: false, data: [gain({ cluster: 'example-cluster', reclaimableCpuCores: 1 })] })).toContain('example-cluster');
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
