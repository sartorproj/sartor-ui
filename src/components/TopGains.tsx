import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Cpu, MemoryStick, Trophy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient, EndpointUnavailableError, type TopGain } from '@/lib/api';
import {
  clusterLabel,
  formatCores,
  formatGiB,
  gainValue,
  rankGains,
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
  query: QueryView<TopGain[]>;
  defaultResource?: GainResource;
}

const formatGain = (value: number, resource: GainResource) => (resource === 'cpu' ? formatCores(value) : formatGiB(value));

export function TopGainsView({ query, defaultResource = 'cpu' }: TopGainsViewProps) {
  const [resource, setResource] = useState<GainResource>(defaultResource);

  if (query.error instanceof EndpointUnavailableError) {
    return <UnavailableNote>{TOP_GAINS_UNAVAILABLE_NOTE}</UnavailableNote>;
  }

  const gains = query.data ?? [];
  const rows = rankGains(gains, resource, TOP_GAINS_LIMIT);
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
            <CardDescription>Containers whose recommendations free up the most requested {resource === 'cpu' ? 'CPU' : 'memory'}</CardDescription>
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
        {query.isLoading && !query.data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading biggest gains…</p>
        ) : query.error && !query.data ? (
          <ErrorNote error={query.error} onRetry={query.refetch} what="biggest gains" />
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {gains.length === 0
              ? 'No gains to show yet. They appear once Tailorings have recommendations.'
              : `No container has reclaimable ${resource === 'cpu' ? 'CPU' : 'memory'}.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 px-3 text-left font-medium w-8">#</th>
                  <th className="py-2 px-3 text-left font-medium">Tailoring / container</th>
                  {showCluster && <th className="py-2 px-3 text-left font-medium">Cluster</th>}
                  <th className="py-2 px-3 text-right font-medium">Reclaimable {resource === 'cpu' ? 'CPU' : 'memory'}</th>
                  <th className="py-2 px-3 text-right font-medium">Reclaimable {other === 'cpu' ? 'CPU' : 'memory'}</th>
                  <th className="py-2 px-3 text-right font-medium">Replicas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((gain, index) => {
                  const name = gain.tailoring ?? gain.targetName;
                  const title = name ? `${gain.namespace}/${name}` : gain.namespace || '-';
                  return (
                    <tr key={`${gain.cluster}/${gain.namespace}/${name}/${gain.container}/${index}`} className="border-b border-border/50 hover:bg-muted/50">
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
                          {gain.targetKind && gain.targetName ? ` · ${gain.targetKind}/${gain.targetName}` : ''}
                        </div>
                      </td>
                      {showCluster && <td className="py-2 px-3">{clusterLabel(gain.cluster)}</td>}
                      <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatGain(gainValue(gain, resource), resource)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-muted-foreground">{formatGain(gainValue(gain, other), other)}</td>
                      <td className="py-2 px-3 text-right font-mono">{gain.replicas ?? '-'}</td>
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
