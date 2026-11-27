import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Cpu, MemoryStick, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { apiClient, DEFAULT_TOP_GAINS_LIMIT, EndpointUnavailableError, type TopGain, type TopGains } from '@/lib/api'
import { formatCores, formatCount, formatGiB, tailoringPath, UNNAMED_CLUSTER } from '@/lib/analytics'
import { SectionNotice } from './SectionNotice'

export type GainResource = 'cpu' | 'memory'

export function TopGainsCard({ limit = DEFAULT_TOP_GAINS_LIMIT }: { limit?: number }) {
  const [resource, setResource] = React.useState<GainResource>('cpu')
  const { data, error, isLoading, refetch } = useQuery<TopGains>({
    queryKey: ['analytics-top-gains', limit],
    queryFn: () => apiClient.getTopGains(limit),
    refetchInterval: 60000,
    retry: (count, err) => !(err instanceof EndpointUnavailableError) && count < 1,
  })
  return (
    <TopGainsView
      gains={data}
      error={error}
      isLoading={isLoading}
      resource={resource}
      onResourceChange={setResource}
      onRetry={() => void refetch()}
    />
  )
}

export interface TopGainsViewProps {
  gains?: TopGains
  error?: Error | null
  isLoading?: boolean
  resource: GainResource
  onResourceChange: (resource: GainResource) => void
  onRetry?: () => void
}

export function TopGainsView({ gains, error, isLoading, resource, onResourceChange, onRetry }: TopGainsViewProps) {
  if (error instanceof EndpointUnavailableError) {
    return <SectionNotice tone="info">{error.message}</SectionNotice>
  }
  const rows = gains?.[resource] ?? []
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Biggest gains
            </CardTitle>
            <CardDescription className="mt-1.5">
              Containers whose recommendations reclaim the most, across all replicas.
            </CardDescription>
          </div>
          <div className="flex gap-1" role="group" aria-label="Rank by">
            <Button
              type="button"
              size="sm"
              variant={resource === 'cpu' ? 'secondary' : 'outline'}
              aria-pressed={resource === 'cpu'}
              onClick={() => onResourceChange('cpu')}
            >
              <Cpu />
              CPU
            </Button>
            <Button
              type="button"
              size="sm"
              variant={resource === 'memory' ? 'secondary' : 'outline'}
              aria-pressed={resource === 'memory'}
              onClick={() => onResourceChange('memory')}
            >
              <MemoryStick />
              Memory
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <SectionNotice tone="error" onRetry={onRetry}>
            Could not load the biggest gains: {error.message}
          </SectionNotice>
        ) : isLoading || !gains ? (
          <p className="text-sm text-muted-foreground">Loading biggest gains…</p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No container has reclaimable {resource === 'cpu' ? 'CPU' : 'memory'}.
          </p>
        ) : (
          <GainsTable rows={rows} resource={resource} />
        )}
      </CardContent>
    </Card>
  )
}

function GainsTable({ rows, resource }: { rows: TopGain[]; resource: GainResource }) {
  const showCluster = rows.some((row) => row.cluster !== '')
  const format = resource === 'cpu' ? formatCores : formatGiB
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Tailoring</TableHead>
          <TableHead>Container</TableHead>
          {showCluster && <TableHead>Cluster</TableHead>}
          <TableHead className="text-right">Replicas</TableHead>
          <TableHead className="text-right">Request per replica</TableHead>
          <TableHead className="text-right">Reclaimable</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => {
          const path = tailoringPath(row)
          const current = resource === 'cpu' ? row.currentCpuCores : row.currentMemoryGiB
          const recommended = resource === 'cpu' ? row.recommendedCpuCores : row.recommendedMemoryGiB
          const name = row.tailoring || row.targetName || '-'
          return (
            <TableRow key={`${index}:${row.cluster}/${row.namespace}/${row.tailoring}/${row.container}`}>
              <TableCell className="font-bold text-muted-foreground">{index + 1}</TableCell>
              <TableCell>
                {path ? (
                  <Link to={path} className="font-medium text-primary hover:underline">
                    {name}
                  </Link>
                ) : (
                  <span className="font-medium">{name}</span>
                )}
                <div className="text-xs text-muted-foreground">{row.namespace || '-'}</div>
              </TableCell>
              <TableCell>{row.container || '-'}</TableCell>
              {showCluster && (
                <TableCell>{row.cluster || <span className="italic text-muted-foreground">{UNNAMED_CLUSTER}</span>}</TableCell>
              )}
              <TableCell className="text-right">{formatCount(row.replicas)}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {current === undefined && recommended === undefined ? '-' : `${format(current)} → ${format(recommended)}`}
              </TableCell>
              <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {format(row[resource === 'cpu' ? 'reclaimableCpuCores' : 'reclaimableMemoryGiB'])}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
