import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Cpu, MemoryStick, Trophy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient, EndpointUnavailableError, type ContainerGain, type TopGainsReport } from '@/lib/api';
import {
  clusterLabel,
  formatCores,
  formatGiB,
  gainSaving,
  gainsFor,
  tailoringPath,
  type GainResource,
  type QueryView,
} from '@/lib/analytics';
import { ErrorNote, UnavailableNote } from './AnalyticsNotes';

export const TOP_GAINS_UNAVAILABLE_NOTE = 'Biggest gains requires a newer Sartor server.';
export const TOP_GAINS_LIMIT = 10;

export function TopGains() {
  const query = useQuery({
    queryKey: ['analytics-top-gains', TOP_GAINS_LIMIT],
    queryFn: () => apiClient.getTopGains(TOP_GAINS_LIMIT),
    refetchInterval: 60000,
    retry: (failures, err) => !(err instanceof EndpointUnavailableError) && failures < 1,
  });
  return <TopGainsView query={query} />;
}

export interface TopGainsViewProps {
  query: QueryView<TopGainsReport>;
  defaultResource?: GainResource;
}

const RESOURCE_LABEL: Record<GainResource, string> = { cpu: 'CPU', memory: 'memory' };

function formatSaving(value: number | undefined, resource: GainResource): string {
  if (value === undefined) return '-';
  return resource === 'cpu' ? formatCores(value) : formatGiB(value);
}

function requestChange(gain: ContainerGain, resource: GainResource): string | undefined {
  const current = gain.currentRequests?.[resource];
  const recommended = gain.recommendedRequests?.[resource];
  if (!current && !recommended) return undefined;
  return `${current ?? '-'} → ${recommended ?? '-'}`;
}

export function TopGainsView({ query, defaultResource = 'cpu' }: TopGainsViewProps) {
  const [resource, setResource] = useState<GainResource>(defaultResource);

  if (query.error instanceof EndpointUnavailableError) {
    return <UnavailableNote>{TOP_GAINS_UNAVAILABLE_NOTE}</UnavailableNote>;
  }

  const report = query.data;
  const rows = report ? gainsFor(report, resource, TOP_GAINS_LIMIT) : [];
  const other: GainResource = resource === 'cpu' ? 'memory' : 'cpu';
  const showCluster = rows.some((g) => g.cluster);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              Biggest gains
            </CardTitle>
            <CardDescription>Containers whose recommendations free up the most requested {RESOURCE_LABEL[resource]}, multiplied by replicas</CardDescription>
          </div>
          <div className="flex gap-1" role="group" aria-label="Rank by resource">
            <Button type="button" size="sm" variant={resource === 'cpu' ? 'secondary' : 'outline'} aria-pressed={resource === 'cpu'} onClick={() => setResource('cpu')}>
              <Cpu />
              CPU
            </Button>
            <Button type="button" size="sm" variant={resource === 'memory' ? 'secondary' : 'outline'} aria-pressed={resource === 'memory'} onClick={() => setResource('memory')}>
              <MemoryStick />
              Memory
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading && !report ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading biggest gains…</p>
        ) : query.error && !report ? (
          <ErrorNote error={query.error} onRetry={query.refetch} what="biggest gains" />
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {!report || report.tailorings.included === 0
              ? 'No gains to show yet. They appear once Tailorings have recommendations.'
              : `No container has reclaimable ${RESOURCE_LABEL[resource]}.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 px-3 text-left font-medium w-8">#</th>
                  <th className="py-2 px-3 text-left font-medium">Tailoring / container</th>
                  {showCluster && <th className="py-2 px-3 text-left font-medium">Cluster</th>}
                  <th className="py-2 px-3 text-right font-medium">Reclaimable {RESOURCE_LABEL[resource]}</th>
                  <th className="py-2 px-3 text-right font-medium">Request per pod</th>
                  <th className="py-2 px-3 text-right font-medium">{other === 'cpu' ? 'CPU' : 'Memory'} change</th>
                  <th className="py-2 px-3 text-right font-medium">Replicas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((gain, index) => {
                  const title = gain.tailoring ? `${gain.namespace}/${gain.tailoring}` : gain.namespace || '-';
                  const workload = gain.workloadKind && gain.workloadName
                    ? `${gain.workloadKind} ${gain.workloadNamespace && gain.workloadNamespace !== gain.namespace ? `${gain.workloadNamespace}/` : ''}${gain.workloadName}`
                    : undefined;
                  return (
                    <tr key={`${gain.cluster}/${gain.namespace}/${gain.tailoring}/${gain.container}/${index}`} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="py-2 px-3 text-muted-foreground">{index + 1}</td>
                      <td className="py-2 px-3">
                        {gain.tailoring && gain.namespace ? (
                          <Link to={tailoringPath(gain.namespace, gain.tailoring)} className="font-medium text-primary hover:underline">
                            {title}
                          </Link>
                        ) : (
                          <span className="font-medium">{title}</span>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {gain.container || '(unnamed container)'}
                          {workload ? ` · ${workload}` : ''}
                        </div>
                      </td>
                      {showCluster && <td className="py-2 px-3">{clusterLabel(gain.cluster)}</td>}
                      <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatSaving(gainSaving(gain, resource), resource)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-muted-foreground">{requestChange(gain, resource) ?? '-'}</td>
                      <td className="py-2 px-3 text-right font-mono text-muted-foreground">{formatSaving(gainSaving(gain, other), other)}</td>
                      <td className="py-2 px-3 text-right font-mono">{gain.replicas}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
