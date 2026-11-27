import { formatDistance } from 'date-fns';
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TailoringSummary } from '@/lib/api';
import { analysisHealth, describeAnalysis, type AnalysisDescription } from '@/lib/analytics';

const REASON_CLASSES: Record<AnalysisDescription['kind'], string> = {
  failing: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200',
  warning: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  pending: '',
  analyzed: '',
};

const relative = (date: Date, now: Date) => formatDistance(date, now, { addSuffix: true });

function nextAnalysisText(d: AnalysisDescription, now: Date): string | undefined {
  if (!d.nextAnalysis) return undefined;
  const noun = d.kind === 'failing' ? 'Retry' : 'Next analysis';
  return d.nextAnalysis.overdue
    ? `${noun} overdue (due ${relative(d.nextAnalysis.at, now)})`
    : `${noun} ${relative(d.nextAnalysis.at, now)}`;
}

/** The Last Analysis cell: when it ran, or why it has not, and when it is tried next. */
export function AnalysisCell({ tailoring, now = new Date() }: { tailoring: TailoringSummary; now?: Date }) {
  const d = describeAnalysis(tailoring, now);
  const next = nextAnalysisText(d, now);
  const failures = d.kind === 'failing' && d.consecutiveFailures > 1 ? `${d.consecutiveFailures} failures in a row` : undefined;
  const showReason = !!d.reason && d.kind !== 'analyzed';

  return (
    <div className="space-y-1 text-sm">
      <div className="text-muted-foreground">{d.lastAnalysis ? relative(d.lastAnalysis, now) : 'Never'}</div>
      {showReason && (
        <Badge
          variant="outline"
          title={d.message}
          tabIndex={d.message ? 0 : undefined}
          className={`cursor-help ${REASON_CLASSES[d.kind]}`}
        >
          {(d.kind === 'failing' || d.kind === 'warning') && <AlertTriangle className="w-3 h-3 mr-1" />}
          {d.reason}
          {d.message && <span className="sr-only">: {d.message}</span>}
        </Badge>
      )}
      {(next || failures) && (
        <div className="text-xs text-muted-foreground">{[next, failures].filter(Boolean).join(' · ')}</div>
      )}
    </div>
  );
}

/** Counts of analyzed, failing and warning (per reason), and not yet analyzed Tailorings. */
export function AnalysisHealthSummary({ tailorings, now = new Date() }: { tailorings: TailoringSummary[]; now?: Date }) {
  if (tailorings.length === 0) return null;
  const health = analysisHealth(tailorings, now);
  return (
    <div role="status" aria-label="Analysis health" className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="outline" className="bg-green-50 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-200 dark:border-green-800">
        <CheckCircle className="w-3 h-3 mr-1" />
        {health.analyzed} analyzed
      </Badge>
      {health.failing > 0 && (
        <Badge variant="outline" className="bg-red-50 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          {health.failing} failing
        </Badge>
      )}
      {health.failingByReason.map(({ reason, count }) => (
        <Badge key={`failing-${reason}`} variant="outline" className="font-normal">
          {reason}: {count}
        </Badge>
      ))}
      {health.warning > 0 && (
        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          {health.warning} with warnings
        </Badge>
      )}
      {health.warningByReason.map(({ reason, count }) => (
        <Badge key={`warning-${reason}`} variant="outline" className="font-normal">
          {reason}: {count}
        </Badge>
      ))}
      {health.pending > 0 && (
        <Badge variant="outline" className="text-muted-foreground">
          <Clock className="w-3 h-3 mr-1" />
          {health.pending} not analyzed yet
        </Badge>
      )}
    </div>
  );
}
