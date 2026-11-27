import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { apiClient, type TailoringSummary } from '@/lib/api';
import { autoscalerOverview, concurrencyLimiter, type AutoscalerOverview } from '@/lib/scaling';

const KIND_CLASSES: Record<string, string> = {
  HPA: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
  KEDA: 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200',
  VPA: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200',
};

export interface AutoscalerIndicatorProps {
  overview?: AutoscalerOverview;
  loading?: boolean;
  /** The Tailoring could not be loaded; the overview is a fallback from the list. */
  failed?: boolean;
}

/** Compact HPA / KEDA / VPA badges and a warning icon when autoscalers conflict. */
export function AutoscalerIndicator({ overview, loading, failed }: AutoscalerIndicatorProps) {
  const kinds = overview?.kinds ?? [];
  const conflicts = overview?.conflicts ?? [];
  if (loading && kinds.length === 0) {
    return (
      <span className="text-sm text-muted-foreground" aria-label="Loading autoscalers">
        …
      </span>
    );
  }
  const names = overview?.names ?? [];
  const title = failed
    ? 'Could not load the autoscalers of this Tailoring'
    : names.length > 0
      ? names.join(', ')
      : kinds.length === 0
        ? 'No autoscaler detected'
        : undefined;
  return (
    <div className="flex items-center gap-1 whitespace-nowrap" title={title}>
      {kinds.length === 0 && <span className="text-sm text-muted-foreground">{failed ? '?' : '-'}</span>}
      {kinds.map((kind) => (
        <span
          key={kind}
          className={`inline-flex items-center rounded border px-1.5 py-0 text-[11px] font-semibold leading-5 ${
            Object.hasOwn(KIND_CLASSES, kind) ? KIND_CLASSES[kind] : 'border-border text-muted-foreground'
          }`}
        >
          {kind}
        </span>
      ))}
      {conflicts.length > 0 && (
        <span
          role="img"
          tabIndex={0}
          aria-label={`${conflicts.length === 1 ? 'Autoscaler conflict' : `${conflicts.length} autoscaler conflicts`}: ${conflicts.join('; ')}`}
          title={conflicts.join('\n')}
          className="inline-flex text-amber-600 dark:text-amber-400 cursor-help"
        >
          <AlertTriangle className="w-4 h-4" />
        </span>
      )}
    </div>
  );
}

// The list endpoint carries no autoscaler fields, so every row loads its
// Tailoring; this keeps those requests from crowding out the rest.
const limitTailoringRequests = concurrencyLimiter(4);

/** The autoscaler indicator of a Tailorings list row, loaded from the Tailoring itself. */
export function TailoringAutoscalers({ summary }: { summary: TailoringSummary }) {
  const query = useQuery({
    queryKey: ['tailoring', summary.namespace, summary.name],
    queryFn: () => limitTailoringRequests(() => apiClient.getTailoring(summary.namespace, summary.name)),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  if (query.data) return <AutoscalerIndicator overview={autoscalerOverview(query.data.status)} />;
  const fallback = autoscalerOverview({ vpaDetected: summary.vpaDetected === true });
  return <AutoscalerIndicator overview={fallback} loading={query.isLoading} failed={!!query.error} />;
}
