import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiClient, EndpointUnavailableError, type SavingsGroup, type SavingsReport } from '@/lib/api';
import { ErrorNote, UnavailableNote } from './AnalyticsNotes';
import {
  clusterLabel,
  cpuNetChangeText,
  formatCores,
  formatCostPerHour,
  formatGiB,
  formatPercent,
  groupSavingsByCluster,
  hasRequestedTotals,
  memoryNetChangeText,
  NO_PERCENT,
  skippedBreakdown,
  type QueryView,
} from '@/lib/analytics';

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
  query: QueryView<SavingsReport>;
  /** Start with every cluster's namespaces shown. */
  defaultExpanded?: boolean;
}

const clusterKey = (cluster: string, index: number) => cluster || `__unnamed-${index}`;

export function SavingsSummaryView({ query, defaultExpanded = false }: SavingsSummaryViewProps) {
  const data = query.data;
  const clusters = data ? groupSavingsByCluster(data) : [];
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(defaultExpanded ? clusters.map((c, i) => clusterKey(c.cluster, i)) : []),
  );

  if (query.error instanceof EndpointUnavailableError) {
    return <UnavailableNote>{SAVINGS_UNAVAILABLE_NOTE}</UnavailableNote>;
  }

  const showCost = !!data && (!!data.pricing || !!data.totals.cost);
  const showRequested = !!data && hasRequestedTotals(data);
  const skipped = data ? skippedBreakdown(data.tailorings) : [];
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
              Requests that recommendations would free up (reclaimable) or add (increase), multiplied by replicas
              {showRequested && '. Net percentages are of the current requests; a negative one is a net increase'}
            </CardDescription>
          </div>
          {data && (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Badge variant="outline">
                {data.tailorings.included} of {data.tailorings.total} Tailorings included
              </Badge>
              {skipped.map(({ key, label, count }) => (
                <Badge key={key} variant="outline" className="border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200">
                  {count} skipped: {label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading && !data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading savings…</p>
        ) : query.error && !data ? (
          <ErrorNote error={query.error} onRetry={query.refetch} what="savings" />
        ) : !data || clusters.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No savings to show yet. They appear once Tailorings have recommendations.
          </p>
        ) : (
          <div className="space-y-6">
            {showRequested ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <Stat
                  label="Requested CPU"
                  value={formatOptional(data.totals.cpu.totalRequestedCores, formatCores)}
                  tone="plain"
                  title={cpuNetChangeText(data.totals.cpu)}
                  detail={<NetChange net={formatCores(data.totals.cpu.netCores)} percent={data.totals.cpu.netPercent} />}
                />
                <Stat label="Reclaimable CPU" value={formatCores(data.totals.cpu.reclaimableCores)} tone={tone(data.totals.cpu.reclaimableCores, 'reclaimable')} />
                <Stat label="CPU increase" value={formatCores(data.totals.cpu.increaseCores)} tone={tone(data.totals.cpu.increaseCores, 'increase')} />
                <Stat
                  label="Requested memory"
                  value={formatOptional(data.totals.memory.totalRequestedGiB, formatGiB)}
                  tone="plain"
                  title={memoryNetChangeText(data.totals.memory)}
                  detail={<NetChange net={formatGiB(data.totals.memory.netGiB)} percent={data.totals.memory.netPercent} />}
                />
                <Stat label="Reclaimable memory" value={formatGiB(data.totals.memory.reclaimableGiB)} tone={tone(data.totals.memory.reclaimableGiB, 'reclaimable')} />
                <Stat label="Memory increase" value={formatGiB(data.totals.memory.increaseGiB)} tone={tone(data.totals.memory.increaseGiB, 'increase')} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat
                  label="Reclaimable CPU"
                  value={formatCores(data.totals.cpu.reclaimableCores)}
                  tone={tone(data.totals.cpu.reclaimableCores, 'reclaimable')}
                  detail={`Net ${formatCores(data.totals.cpu.netCores)}`}
                />
                <Stat
                  label="Reclaimable memory"
                  value={formatGiB(data.totals.memory.reclaimableGiB)}
                  tone={tone(data.totals.memory.reclaimableGiB, 'reclaimable')}
                  detail={`Net ${formatGiB(data.totals.memory.netGiB)}`}
                />
                <Stat label="CPU increase" value={formatCores(data.totals.cpu.increaseCores)} tone={tone(data.totals.cpu.increaseCores, 'increase')} />
                <Stat label="Memory increase" value={formatGiB(data.totals.memory.increaseGiB)} tone={tone(data.totals.memory.increaseGiB, 'increase')} />
              </div>
            )}
            {data.totals.cost && (
              <p className="text-sm text-muted-foreground">
                Estimated cost at the given prices: {formatCostPerHour(data.totals.cost.reclaimablePerHour)} reclaimable,{' '}
                {formatCostPerHour(data.totals.cost.increasePerHour)} increase, {formatCostPerHour(data.totals.cost.netPerHour)} net
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 px-3 text-left font-medium">Cluster / namespace</th>
                    <th className="py-2 px-3 text-right font-medium">Tailorings</th>
                    {showRequested && <th className="py-2 px-3 text-right font-medium">Requested CPU</th>}
                    <th className="py-2 px-3 text-right font-medium">Reclaimable CPU</th>
                    <th className="py-2 px-3 text-right font-medium">CPU increase</th>
                    <th className="py-2 px-3 text-right font-medium">Net CPU</th>
                    {showRequested && <th className="py-2 px-3 text-right font-medium">Requested memory</th>}
                    <th className="py-2 px-3 text-right font-medium">Reclaimable memory</th>
                    <th className="py-2 px-3 text-right font-medium">Memory increase</th>
                    <th className="py-2 px-3 text-right font-medium">Net memory</th>
                    {showCost && <th className="py-2 px-3 text-right font-medium">Net cost</th>}
                  </tr>
                </thead>
                <tbody>
                  {clusters.map((cluster, index) => {
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
                        <AmountCells group={cluster} showCost={showCost} showRequested={showRequested} />
                      </tr>,
                      ...(isOpen
                        ? cluster.namespaces.map((ns, nsIndex) => (
                            <tr key={`${key}/${ns.namespace || nsIndex}`} className="border-b border-border/30 text-muted-foreground">
                              <td className="py-1.5 px-3 pl-10">{ns.namespace || <span className="italic">(no namespace)</span>}</td>
                              <AmountCells group={ns} showCost={showCost} showRequested={showRequested} />
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

type Tone = 'good' | 'warn' | 'neutral' | 'plain';

function tone(value: number | undefined, kind: 'reclaimable' | 'increase' | 'net'): Tone {
  if (value === undefined || !Number.isFinite(value) || value === 0 || (kind !== 'net' && value < 0)) return 'neutral';
  if (kind === 'increase') return 'warn';
  return value > 0 ? 'good' : 'warn';
}

const TONE_CLASSES: Record<Tone, string> = {
  good: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  neutral: 'text-muted-foreground',
  plain: '',
};

const formatOptional = (value: number | undefined, format: (v: number) => string) =>
  value === undefined ? NO_PERCENT : format(value);

function Stat({ label, value, tone, detail, title }: { label: string; value: string; tone: Tone; detail?: ReactNode; title?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3" title={title}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold font-mono ${TONE_CLASSES[tone]}`}>{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground font-mono">{detail}</p>}
    </div>
  );
}

/** "Net -20 cores (-4.9%)", the percentage green for a net reduction and amber for a net increase. */
function NetChange({ net, percent }: { net: string; percent: number | undefined }) {
  return (
    <>
      Net {net} <span className={TONE_CLASSES[tone(percent, 'net')]}>({formatPercent(percent)})</span>
    </>
  );
}

function ClusterName({ name, label }: { name: string; label: string }) {
  return name ? <span>{label}</span> : <span className="italic" title="The Tailorings set no target cluster">{label}</span>;
}

function NetCell({ net, netValue, percent, title, showPercent }: { net: string; netValue: number; percent?: number; title: string; showPercent: boolean }) {
  return (
    <td className={`py-2 px-3 text-right font-mono whitespace-nowrap ${TONE_CLASSES[tone(netValue, 'net')]}`} title={showPercent ? title : undefined}>
      {net}
      {showPercent && <div className={`text-xs ${TONE_CLASSES[tone(percent, 'net')]}`}>{formatPercent(percent)}</div>}
    </td>
  );
}

function AmountCells({ group, showCost, showRequested }: { group: SavingsGroup; showCost: boolean; showRequested: boolean }) {
  const cell = 'py-2 px-3 text-right font-mono whitespace-nowrap';
  return (
    <>
      <td className={cell}>{group.tailorings}</td>
      {showRequested && <td className={cell}>{formatOptional(group.cpu.totalRequestedCores, formatCores)}</td>}
      <td className={`${cell} ${TONE_CLASSES[tone(group.cpu.reclaimableCores, 'reclaimable')]}`}>{formatCores(group.cpu.reclaimableCores)}</td>
      <td className={`${cell} ${TONE_CLASSES[tone(group.cpu.increaseCores, 'increase')]}`}>{formatCores(group.cpu.increaseCores)}</td>
      <NetCell
        net={formatCores(group.cpu.netCores)}
        netValue={group.cpu.netCores}
        percent={group.cpu.netPercent}
        title={cpuNetChangeText(group.cpu)}
        showPercent={showRequested}
      />
      {showRequested && <td className={cell}>{formatOptional(group.memory.totalRequestedGiB, formatGiB)}</td>}
      <td className={`${cell} ${TONE_CLASSES[tone(group.memory.reclaimableGiB, 'reclaimable')]}`}>{formatGiB(group.memory.reclaimableGiB)}</td>
      <td className={`${cell} ${TONE_CLASSES[tone(group.memory.increaseGiB, 'increase')]}`}>{formatGiB(group.memory.increaseGiB)}</td>
      <NetCell
        net={formatGiB(group.memory.netGiB)}
        netValue={group.memory.netGiB}
        percent={group.memory.netPercent}
        title={memoryNetChangeText(group.memory)}
        showPercent={showRequested}
      />
      {showCost && <td className={cell}>{group.cost ? formatCostPerHour(group.cost.netPerHour) : '-'}</td>}
    </>
  );
}
