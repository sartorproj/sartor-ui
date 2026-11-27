import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { tailoringAnalysisStatus, type TailoringSummary } from '@/lib/api'
import { analysisHealth } from '@/lib/analytics'
import { AnalysisHealthSummary, LastAnalysisCell } from './AnalysisStatus'

const now = new Date('2026-01-01T12:00:00Z')

const summary = (fields: Partial<TailoringSummary> = {}): TailoringSummary => ({
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
})

const cell = (fields: Partial<TailoringSummary>) =>
  renderToStaticMarkup(<LastAnalysisCell status={tailoringAnalysisStatus(summary(fields))} now={now} />)

describe('LastAnalysisCell', () => {
  test('shows Never for a Tailoring without any condition', () => {
    const html = cell({})
    expect(html).toContain('Never')
    expect(html).not.toContain('Retry')
  })

  test('shows the reason instead of Never, with the message as a tooltip and the retry time', () => {
    const html = cell({
      analyzedCondition: 'False',
      analyzedReason: 'TargetNotFound',
      analyzedMessage: 'deployments.apps "example-app" not found',
      nextAnalysisTime: '2026-01-01T12:05:00Z',
      consecutiveFailures: 4,
    })
    expect(html).not.toContain('Never')
    expect(html).toContain('>TargetNotFound<')
    expect(html).toContain('title="deployments.apps &quot;example-app&quot; not found"')
    expect(html).toContain('Retry in 5 minutes')
    expect(html).toContain('4 consecutive failures')
  })

  test('marks a retry time in the past as overdue', () => {
    const html = cell({ analyzedCondition: 'False', analyzedReason: 'NoMetrics', nextAnalysisTime: '2026-01-01T11:50:00Z' })
    expect(html).toContain('Retry overdue by 10 minutes')
    expect(html).not.toContain('1 consecutive')
  })

  test('keeps the last analysis time next to a newer failure', () => {
    const html = cell({ lastAnalysis: '2026-01-01T10:00:00Z', analyzedCondition: 'False', analyzedReason: 'MetricsQueryError' })
    expect(html).toContain('about 2 hours ago')
    expect(html).toContain('MetricsQueryError')
  })

  test('labels a failure without a reason', () => {
    const html = cell({ consecutiveFailures: 1, analyzedMessage: 'boom' })
    expect(html).toContain('Analysis failing')
    expect(html).toContain('title="boom"')
  })

  test('shows the next analysis of a healthy Tailoring', () => {
    const html = cell({ lastAnalysis: '2026-01-01T11:00:00Z', analyzedCondition: 'True', nextAnalysisTime: '2026-01-01T13:00:00Z' })
    expect(html).toContain('about 1 hour ago')
    expect(html).toContain('Next analysis in about 1 hour')
    expect(html).not.toContain('Retry')
  })

  test('does not throw on an unparseable last analysis time', () => {
    expect(cell({ lastAnalysis: 'not a time' })).toContain('Never')
  })
})

describe('AnalysisHealthSummary', () => {
  test('counts analyzed, failing by reason and pending Tailorings', () => {
    const statuses = [
      summary({ lastAnalysis: '2026-01-01T11:00:00Z' }),
      summary({ analyzedCondition: 'False', analyzedReason: 'TargetNotFound' }),
      summary({ analyzedCondition: 'False', analyzedReason: 'TargetNotFound' }),
      summary({ analyzedCondition: 'False', analyzedReason: 'NoMetrics' }),
      summary(),
    ].map(tailoringAnalysisStatus)
    const html = renderToStaticMarkup(<AnalysisHealthSummary health={analysisHealth(statuses)} />)
    expect(html).toContain('1 analyzed')
    expect(html).toContain('3 failing')
    expect(html).toContain('TargetNotFound: 2')
    expect(html).toContain('NoMetrics: 1')
    expect(html).toContain('1 pending')
  })

  test('shows only the analyzed count when nothing fails or waits', () => {
    const html = renderToStaticMarkup(<AnalysisHealthSummary health={analysisHealth([])} />)
    expect(html).toContain('0 analyzed')
    expect(html).not.toContain('failing')
    expect(html).not.toContain('pending')
  })
})
