import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  apiClient,
  EndpointUnavailableError,
  type SavingsAmounts,
  type SavingsSummary as SavingsSummaryData,
} from '@/lib/api';
import { ErrorNote, UnavailableNote } from './AnalyticsNotes';
import { clusterLabel, formatCores, formatCost, formatGiB, type QueryView } from '@/lib/analytics';

export const SAVINGS_UNAVAILABLE_NOTE = 'The savings summary requires a newer Sartor server.';

export function SavingsSummary() {
  const query = useQuery({
    queryKey: ['analytics-savings'],
    queryFn: () => apiClient.getSavingsSummary(),
    refetchInterval: 60000,
    retry: (failures, err) => !(err instanceof EndpointUnavailableError) && failures < 1,
  });
  return <SavingsSummaryView query={query} />;
}

export interface SavingsSummaryViewProps {
  query: QueryView<SavingsSummaryData>;
  /** Start with every cluster's namespaces shown. */
  defaultExpanded?: boolean;
}

const clusterKey = (cluster: string, index: number) => cluster || `__unnamed-${index}`;

export function SavingsSummaryView({ query, defaultExpanded = false }: SavingsSummaryViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(defaultExpanded ? (query.data?.clusters ?? []).map((c, i) => clusterKey(c.cluster, i)) : []),
  );

  if (query.error instanceof EndpointUnavailableError) {
    return <UnavailableNote>{SAVINGS_UNAVAILABLE_NOTE}</UnavailableNote>;
  }

  const data = query.data;
  const showCost = !!data && (!!data.totals.cost || data.clusters.some((c) => c.cost || c.namespaces.some((n) => n.cost)));
  const toggle = (cluster: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cluster)) next.delete(cluster);
      else next.add(cluster);
      return next;
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5" />
              Right-sizing savings
            </CardTitle>
            <CardDescription>
              Requests that recommendations would free up (reclaimable) or add (needed), multiplied by replicas
            </CardDescription>
          </div>
          {data && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{data.totals.included} included</Badge>
              <Badge
                variant="outline"
                className={data.totals.skipped > 0 ? 'border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200' : ''}
              >
                {data.totals.skipped} skipped
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading && !data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading savings…</p>
        ) : query.error && !data ? (
          <ErrorNote error={query.error} onRetry={query.refetch} what="savings" />
        ) : !data || data.clusters.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No savings to show yet. They appear once Tailorings have recommendations.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Reclaimable CPU" value={formatCores(data.totals.reclaimableCpuCores)} tone={tone(data.totals.reclaimableCpuCores, 'reclaimable')} />
              <Stat label="Reclaimable memory" value={formatGiB(data.totals.reclaimableMemoryGiB)} tone={tone(data.totals.reclaimableMemoryGiB, 'reclaimable')} />
              <Stat label="Needed CPU" value={formatCores(data.totals.neededCpuCores)} tone={tone(data.totals.neededCpuCores, 'needed')} />
              <Stat label="Needed memory" value={formatGiB(data.totals.neededMemoryGiB)} tone={tone(data.totals.neededMemoryGiB, 'needed')} />
            </div>
            {data.totals.cost && (
              <p className="text-sm text-muted-foreground">
                Estimated cost: {formatCost(data.totals.cost.reclaimable, data.totals.cost.currency, data.totals.cost.period)} reclaimable,{' '}
                {formatCost(data.totals.cost.needed, data.totals.cost.currency, data.totals.cost.period)} needed
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 px-3 text-left font-medium">Cluster / namespace</th>
                    <th className="py-2 px-3 text-right font-medium">Reclaimable CPU</th>
                    <th className="py-2 px-3 text-right font-medium">Reclaimable memory</th>
                    <th className="py-2 px-3 text-right font-medium">Needed CPU</th>
                    <th className="py-2 px-3 text-right font-medium">Needed memory</th>
                    <th className="py-2 px-3 text-right font-medium">Included</th>
                    <th className="py-2 px-3 text-right font-medium">Skipped</th>
                    {showCost && <th className="py-2 px-3 text-right font-medium">Est. cost</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.clusters.map((cluster, index) => {
                    const key = clusterKey(cluster.cluster, index);
                    const isOpen = expanded.has(key);
                    const label = clusterLabel(cluster.cluster);
                    return [
                      <tr key={key} className="border-b border-border/50 font-medium">
                        <td className="py-2 px-3">
                          {cluster.namespaces.length > 0 ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 hover:underline"
                              aria-expanded={isOpen}
                              onClick={() => toggle(key)}
                            >
                              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              <ClusterName name={cluster.cluster} label={label} />
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 pl-5">
                              <ClusterName name={cluster.cluster} label={label} />
                            </span>
                          )}
                        </td>
                        <AmountCells amounts={cluster} showCost={showCost} />
                      </tr>,
                      ...(isOpen
                        ? cluster.namespaces.map((ns, nsIndex) => (
                            <tr key={`${key}/${ns.namespace || nsIndex}`} className="border-b border-border/30 text-muted-foreground">
                              <td className="py-1.5 px-3 pl-10">{ns.namespace || <span className="italic">(no namespace)</span>}</td>
                              <AmountCells amounts={ns} showCost={showCost} />
                            </tr>
                          ))
                        : []),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type Tone = 'good' | 'warn' | 'neutral';

function tone(value: number, kind: 'reclaimable' | 'needed'): Tone {
  if (value <= 0) return 'neutral';
  return kind === 'reclaimable' ? 'good' : 'warn';
}

const TONE_CLASSES: Record<Tone, string> = {
  good: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  neutral: 'text-muted-foreground',
};

function Stat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold font-mono ${TONE_CLASSES[tone]}`}>{value}</p>
    </div>
  );
}

function ClusterName({ name, label }: { name: string; label: string }) {
  return name ? <span>{label}</span> : <span className="italic" title="The server reports no cluster name">{label}</span>;
}

function AmountCells({ amounts, showCost }: { amounts: SavingsAmounts; showCost: boolean }) {
  const cell = 'py-2 px-3 text-right font-mono';
  return (
    <>
      <td className={`${cell} ${TONE_CLASSES[tone(amounts.reclaimableCpuCores, 'reclaimable')]}`}>{formatCores(amounts.reclaimableCpuCores)}</td>
      <td className={`${cell} ${TONE_CLASSES[tone(amounts.reclaimableMemoryGiB, 'reclaimable')]}`}>{formatGiB(amounts.reclaimableMemoryGiB)}</td>
      <td className={`${cell} ${TONE_CLASSES[tone(amounts.neededCpuCores, 'needed')]}`}>{formatCores(amounts.neededCpuCores)}</td>
      <td className={`${cell} ${TONE_CLASSES[tone(amounts.neededMemoryGiB, 'needed')]}`}>{formatGiB(amounts.neededMemoryGiB)}</td>
      <td className={cell}>{amounts.included}</td>
      <td className={cell}>{amounts.skipped}</td>
      {showCost && (
        <td className={cell}>
          {amounts.cost ? formatCost(amounts.cost.reclaimable, amounts.cost.currency, amounts.cost.period) : '-'}
        </td>
      )}
    </>
  );
}
