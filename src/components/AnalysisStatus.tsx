import { formatDistance } from 'date-fns'
import { AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AnalysisStatus } from '@/lib/api'
import { describeNextAnalysis, type AnalysisHealth } from '@/lib/analytics'

const FAILING_BADGE = 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300 dark:border-red-700'
const ANALYZED_BADGE =
  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700'

export interface LastAnalysisCellProps {
  status: AnalysisStatus
  now: Date
}

/** The last analysis time, and for a failing Tailoring why it fails and when it is retried. */
export function LastAnalysisCell({ status, now }: LastAnalysisCellProps) {
  const failing = status.state === 'failing'
  const last = status.lastAnalysis
  const next = describeNextAnalysis(status.nextAnalysis, now, failing)
  const details = [
    next,
    failing && status.consecutiveFailures > 1 ? `${status.consecutiveFailures} consecutive failures` : undefined,
  ].filter(Boolean)

  return (
    <div className="space-y-1 text-sm">
      {last ? (
        <div className="text-muted-foreground" title={last.toLocaleString()}>
          {formatDistance(last, now, { addSuffix: true })}
        </div>
      ) : !failing ? (
        <div className="text-muted-foreground">{status.state === 'analyzed' ? 'Analyzed' : 'Never'}</div>
      ) : null}
      {failing && <FailureBadge status={status} />}
      {details.length > 0 && <div className="text-xs text-muted-foreground">{details.join(' · ')}</div>}
    </div>
  )
}

function FailureBadge({ status }: { status: AnalysisStatus }) {
  const label = status.reason || 'Analysis failing'
  const tooltip = status.message && status.message !== label ? status.message : undefined
  return (
    <Badge variant="outline" className={`${FAILING_BADGE} max-w-full cursor-help`} title={tooltip ?? label} tabIndex={0}>
      <AlertCircle className="mr-1 h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
      {tooltip && <span className="sr-only">: {tooltip}</span>}
    </Badge>
  )
}

/** Counts of analyzed, failing (by reason) and pending Tailorings. */
export function AnalysisHealthSummary({ health }: { health: AnalysisHealth }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="Analysis health">
      <Badge variant="outline" className={ANALYZED_BADGE}>
        <CheckCircle className="mr-1 h-3 w-3" />
        {health.analyzed} analyzed
      </Badge>
      {health.failing > 0 && (
        <Badge variant="outline" className={FAILING_BADGE}>
          <AlertCircle className="mr-1 h-3 w-3" />
          {health.failing} failing
        </Badge>
      )}
      {health.failingByReason.map(({ reason, count }) => (
        <Badge key={reason} variant="secondary" className="font-mono font-normal">
          {reason}: {count}
        </Badge>
      ))}
      {health.pending > 0 && (
        <Badge variant="outline" className="text-muted-foreground">
          <Clock className="mr-1 h-3 w-3" />
          {health.pending} pending
        </Badge>
      )}
    </div>
  )
}
