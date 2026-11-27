import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { EndpointUnavailableError, normalizeSavingsReport, normalizeTopGains, type OpenCostHealthStatus } from '@/lib/api'
import { UNNAMED_CLUSTER, UNNAMED_NAMESPACE } from '@/lib/analytics'
import { OpenCostGate } from './OpenCostGate'
import { SavingsSummaryView, type SavingsSummaryViewProps } from './SavingsSummary'
import { TopGainsView, type TopGainsViewProps } from './TopGains'

const savings = (props: SavingsSummaryViewProps) => renderToStaticMarkup(<SavingsSummaryView {...props} />)

const namespace = (name: string, cpu: number, memory: number) => ({
  namespace: name,
  reclaimableCpuCores: cpu,
  neededCpuCores: 0,
  reclaimableMemoryGiB: memory,
  neededMemoryGiB: 0,
  included: 1,
  skipped: 0,
})

const twoClusters = normalizeSavingsReport({
  clusters: [
    { cluster: 'example-cluster', namespaces: [namespace('example-namespace', 2, 4)] },
    { cluster: '', namespaces: [namespace('', 0.05, 120 / 1024)] },
  ],
})

describe('SavingsSummaryView', () => {
  test('shows totals and clusters, collapsed when there are several', () => {
    const html = savings({ report: twoClusters })
    expect(html).toContain('Recommendation savings')
    expect(html).toContain('2.05 cores')
    expect(html).toContain('example-cluster')
    expect(html).toContain(UNNAMED_CLUSTER)
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('example-namespace')
    expect(html).not.toContain('NaN')
  })

  test('lists the unnamed cluster after the named ones', () => {
    const html = savings({ report: twoClusters })
    expect(html.indexOf('example-cluster')).toBeLessThan(html.indexOf(UNNAMED_CLUSTER))
  })

  test('expands a single cluster to its namespaces', () => {
    const report = normalizeSavingsReport({
      clusters: [{ cluster: '', namespaces: [namespace('example-namespace', 0.05, 120 / 1024), namespace('', 1, 1)] }],
    })
    const html = savings({ report })
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('example-namespace')
    expect(html).toContain(UNNAMED_NAMESPACE)
    expect(html).toContain('0.05 cores')
    expect(html).toContain('120 MiB')
  })

  test('shows included and skipped counts', () => {
    const report = normalizeSavingsReport({ clusters: [], included: 12, skipped: 3 })
    const html = savings({ report })
    expect(html).toMatch(/Included: <span[^>]*>12</)
    expect(html).toMatch(/Skipped: <span[^>]*>3</)
    expect(html).toContain('No recommendations to summarize yet.')
  })

  test('renders negative totals with their sign', () => {
    const report = normalizeSavingsReport({
      clusters: [{ cluster: 'example-cluster', reclaimableCpuCores: -0.5, reclaimableMemoryGiB: -0.25, namespaces: [] }],
    })
    const html = savings({ report })
    expect(html).toContain('-0.5 cores')
    expect(html).toContain('-256 MiB')
    expect(html).not.toContain('aria-expanded')
  })

  test('shows cost only when the server sent it', () => {
    expect(savings({ report: twoClusters })).not.toContain('Estimated cost')
    const report = normalizeSavingsReport({ clusters: [{ cluster: 'example-cluster', reclaimableCost: 42, neededCost: 0 }], currency: 'USD' })
    expect(savings({ report })).toContain('Estimated cost: $42.00 reclaimable, $0.00 needed')
  })

  test('replaces the section with a short note on an older server', () => {
    const html = savings({ error: new EndpointUnavailableError('The savings summary requires a newer Sartor server version.') })
    expect(html).toContain('requires a newer Sartor server version')
    expect(html).not.toContain('Recommendation savings')
    expect(html).not.toContain('Retry')
  })

  test('shows other errors with a retry button', () => {
    const html = savings({ error: new Error('Savings request failed with status 500'), onRetry: () => {} })
    expect(html).toContain('Could not load savings: Savings request failed with status 500')
    expect(html).toContain('Retry')
  })

  test('shows loading', () => {
    expect(savings({ isLoading: true })).toContain('Loading savings')
  })
})

const gains = normalizeTopGains([
  {
    cluster: 'example-cluster',
    namespace: 'example-namespace',
    tailoring: 'example-app',
    container: 'app',
    replicas: 3,
    reclaimableCpuCores: 1.5,
    reclaimableMemoryGiB: 0,
    currentCpuCores: 1,
    recommendedCpuCores: 0.5,
  },
  { namespace: 'example-namespace', container: 'worker', reclaimableCpuCores: 0.05, reclaimableMemoryGiB: 120 / 1024 },
])

const topGains = (props: Partial<TopGainsViewProps>) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TopGainsView resource="cpu" onResourceChange={() => {}} {...props} />
    </MemoryRouter>,
  )

describe('TopGainsView', () => {
  test('ranks by CPU and links to the Tailoring', () => {
    const html = topGains({ gains })
    expect(html).toContain('href="/tailorings/example-namespace/example-app"')
    expect(html).toContain('1 core → 0.5 cores')
    expect(html).toContain('1.5 cores')
    expect(html).toContain('0.05 cores')
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*CPU/)
    expect(html).not.toContain('NaN')
  })

  test('does not link a row without a Tailoring name', () => {
    const html = topGains({ gains })
    expect(html.match(/href="\/tailorings\//g)).toHaveLength(1)
  })

  test('switches to memory, leaving out containers without a memory gain', () => {
    const html = topGains({ gains, resource: 'memory' })
    expect(html).toContain('120 MiB')
    expect(html).toContain('worker')
    expect(html).not.toContain('example-app')
  })

  test('explains an empty ranking', () => {
    expect(topGains({ gains: { cpu: [], memory: [] } })).toContain('No container has reclaimable CPU.')
    expect(topGains({ gains: { cpu: [], memory: [] }, resource: 'memory' })).toContain('No container has reclaimable memory.')
  })

  test('hides the cluster column when no row has a cluster', () => {
    const html = topGains({ gains: normalizeTopGains([{ namespace: 'example-namespace', tailoring: 'example-app', reclaimableCpuCores: 1 }]) })
    expect(html).not.toContain('>Cluster<')
  })

  test('replaces the section with a short note on an older server', () => {
    const html = topGains({ error: new EndpointUnavailableError('Biggest gains requires a newer Sartor server version.') })
    expect(html).toContain('requires a newer Sartor server version')
    expect(html).not.toContain('aria-pressed')
  })

  test('shows other errors', () => {
    expect(topGains({ error: new Error('boom') })).toContain('Could not load the biggest gains: boom')
  })
})

const gate = (props: { health?: OpenCostHealthStatus; isLoading?: boolean; error?: Error | null }) =>
  renderToStaticMarkup(
    <OpenCostGate {...props} onRetry={() => {}}>
      <p>opencost panels</p>
    </OpenCostGate>,
  )

describe('OpenCostGate', () => {
  test('shows the panels when OpenCost is healthy', () => {
    const html = gate({ health: { enabled: true, connected: true } })
    expect(html).toContain('opencost panels')
    expect(html).not.toContain('OpenCost Integration Required')
  })

  test('explains a disabled integration', () => {
    const html = gate({ health: { enabled: false, connected: false } })
    expect(html).not.toContain('opencost panels')
    expect(html).toContain('OpenCost integration is not enabled')
  })

  test('explains a failed connection', () => {
    const html = gate({ health: { enabled: true, connected: false, error: 'dial tcp: connection refused' } })
    expect(html).toContain('Unable to connect to OpenCost: dial tcp: connection refused')
    expect(html).not.toContain('Retry')
  })

  test('explains a failing health check with a retry button', () => {
    const html = gate({ error: new Error('Request failed with status code 500') })
    expect(html).not.toContain('opencost panels')
    expect(html).toContain('Could not check the OpenCost status: Request failed with status code 500')
    expect(html).toContain('Retry')
  })

  test('shows a placeholder while checking', () => {
    const html = gate({ isLoading: true })
    expect(html).toContain('Checking OpenCost')
    expect(html).not.toContain('opencost panels')
  })
})
