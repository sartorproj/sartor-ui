import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, PiggyBank } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  apiClient,
  EndpointUnavailableError,
  type ClusterSavings,
  type NamespaceSavings,
  type SavingsReport,
} from '@/lib/api'
import { formatCores, formatCost, formatCount, formatGiB, UNNAMED_CLUSTER, UNNAMED_NAMESPACE } from '@/lib/analytics'
import { SectionNotice } from './SectionNotice'

export function SavingsSummary() {
  const { data, error, isLoading, refetch } = useQuery<SavingsReport>({
    queryKey: ['analytics-savings'],
    queryFn: () => apiClient.getSavingsReport(),
    refetchInterval: 60000,
    retry: (count, err) => !(err instanceof EndpointUnavailableError) && count < 1,
  })
  return <SavingsSummaryView report={data} error={error} isLoading={isLoading} onRetry={() => void refetch()} />
}

export interface SavingsSummaryViewProps {
  report?: SavingsReport
  error?: Error | null
  isLoading?: boolean
  onRetry?: () => void
}

const TITLE = 'Recommendation savings'
const DESCRIPTION =
  'How requests would change if the latest recommendations were applied: (current - recommended request) × replicas.'

export function SavingsSummaryView({ report, error, isLoading, onRetry }: SavingsSummaryViewProps) {
  if (error instanceof EndpointUnavailableError) {
    return <SectionNotice tone="info">{error.message}</SectionNotice>
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PiggyBank className="h-5 w-5" />
          {TITLE}
        </CardTitle>
        <CardDescription>{DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <SectionNotice tone="error" onRetry={onRetry}>
            Could not load savings: {error.message}
          </SectionNotice>
        ) : isLoading || !report ? (
          <p className="text-sm text-muted-foreground">Loading savings…</p>
        ) : (
          <SavingsContent report={report} />
        )}
      </CardContent>
    </Card>
  )
}

function SavingsContent({ report }: { report: SavingsReport }) {
  const { total, currency } = report
  const clusters = React.useMemo(() => sortClusters(report.clusters), [report.clusters])
  const hasCost = total.reclaimableCost !== undefined || total.neededCost !== undefined
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="CPU reclaimable" value={formatCores(total.reclaimableCpuCores)} tone="gain" />
        <Stat label="CPU needed" value={formatCores(total.neededCpuCores)} tone="need" />
        <Stat label="Memory reclaimable" value={formatGiB(total.reclaimableMemoryGiB)} tone="gain" />
        <Stat label="Memory needed" value={formatGiB(total.neededMemoryGiB)} tone="need" />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span title="Containers counted in the totals">
          Included: <span className="font-medium text-foreground">{formatCount(total.included)}</span>
        </span>
        <span title="Containers left out of the totals, for example because they have no recommendation yet">
          Skipped: <span className="font-medium text-foreground">{formatCount(total.skipped)}</span>
        </span>
        {hasCost && (
          <span>
            Estimated cost: {formatCost(total.reclaimableCost, currency)} reclaimable,{' '}
            {formatCost(total.neededCost, currency)} needed
          </span>
        )}
      </div>
      {clusters.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No recommendations to summarize yet.
        </p>
      ) : (
        <SavingsTable clusters={clusters} />
      )}
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'gain' | 'need' }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-xl font-bold ${
          tone === 'gain' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function sortClusters(clusters: ClusterSavings[]): ClusterSavings[] {
  return [...clusters]
    .sort((a, b) => (a.cluster === '' ? 1 : 0) - (b.cluster === '' ? 1 : 0) || a.cluster.localeCompare(b.cluster))
    .map((cluster) => ({ ...cluster, namespaces: sortNamespaces(cluster.namespaces) }))
}

function sortNamespaces(namespaces: NamespaceSavings[]): NamespaceSavings[] {
  return [...namespaces].sort(
    (a, b) =>
      b.reclaimableCpuCores - a.reclaimableCpuCores ||
      b.reclaimableMemoryGiB - a.reclaimableMemoryGiB ||
      a.namespace.localeCompare(b.namespace),
  )
}

function SavingsTable({ clusters }: { clusters: ClusterSavings[] }) {
  // With a single cluster there is nothing to choose between, so it starts expanded.
  const defaultExpanded = clusters.length === 1
  const [toggled, setToggled] = React.useState<Record<string, boolean>>({})
  const toggle = (key: string, expanded: boolean) => setToggled((prev) => ({ ...prev, [key]: !expanded }))

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cluster / namespace</TableHead>
          <TableHead className="text-right">CPU reclaimable</TableHead>
          <TableHead className="text-right">CPU needed</TableHead>
          <TableHead className="text-right">Memory reclaimable</TableHead>
          <TableHead className="text-right">Memory needed</TableHead>
          <TableHead className="text-right">Included</TableHead>
          <TableHead className="text-right">Skipped</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clusters.map((cluster, index) => {
          const key = `${index}:${cluster.cluster}`
          const expanded = toggled[key] ?? defaultExpanded
          const expandable = cluster.namespaces.length > 0
          const name = cluster.cluster || UNNAMED_CLUSTER
          return (
            <React.Fragment key={key}>
              <TableRow className="font-medium">
                <TableCell>
                  {expandable ? (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
                      onClick={() => toggle(key, expanded)}
                      className="inline-flex items-center gap-1 rounded hover:text-primary"
                    >
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <ClusterName name={cluster.cluster} />
                    </button>
                  ) : (
                    <span className="pl-5">
                      <ClusterName name={cluster.cluster} />
                    </span>
                  )}
                </TableCell>
                <SavingsCells savings={cluster} />
              </TableRow>
              {expanded &&
                cluster.namespaces.map((namespace, nsIndex) => (
                  <TableRow key={`${key}/${nsIndex}:${namespace.namespace}`} className="text-muted-foreground">
                    <TableCell className="pl-10">
                      {namespace.namespace || <span className="italic">{UNNAMED_NAMESPACE}</span>}
                    </TableCell>
                    <SavingsCells savings={namespace} />
                  </TableRow>
                ))}
            </React.Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

function ClusterName({ name }: { name: string }) {
  return name ? <span>{name}</span> : <span className="italic text-muted-foreground">{UNNAMED_CLUSTER}</span>
}

function SavingsCells({ savings }: { savings: ClusterSavings | NamespaceSavings }) {
  return (
    <>
      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">
        {formatCores(savings.reclaimableCpuCores)}
      </TableCell>
      <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
        {formatCores(savings.neededCpuCores)}
      </TableCell>
      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">
        {formatGiB(savings.reclaimableMemoryGiB)}
      </TableCell>
      <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
        {formatGiB(savings.neededMemoryGiB)}
      </TableCell>
      <TableCell className="text-right">{formatCount(savings.included)}</TableCell>
      <TableCell className="text-right">{formatCount(savings.skipped)}</TableCell>
    </>
  )
}
