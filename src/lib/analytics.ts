import {
  tailoringAnalysisState,
  type ContainerGain,
  type OpenCostHealthStatus,
  type SavingsAmounts,
  type SavingsCounts,
  type SavingsGroup,
  type SavingsReport,
  type TailoringSummary,
  type TopGainsReport,
} from './api';

/** The parts of a query result the analytics views render from. */
export interface QueryView<T> {
  data?: T;
  error?: unknown;
  isLoading: boolean;
  refetch?: () => void;
}

const numberFormat = (maximumFractionDigits: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits, minimumFractionDigits: 0 });

/** Formats CPU cores, e.g. "12.5 cores", "0.05 cores", "< 0.001 cores". */
export function formatCores(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0 cores';
  const abs = Math.abs(value);
  if (abs < 0.0005) return value < 0 ? '> -0.001 cores' : '< 0.001 cores';
  const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 3;
  const text = numberFormat(digits).format(abs);
  return `${value < 0 ? '-' : ''}${text} ${text === '1' ? 'core' : 'cores'}`;
}

/** Formats a GiB amount, switching to MiB below 1 GiB and TiB from 1024 GiB, e.g. "120 MiB". */
export function formatGiB(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0 GiB';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const mib = abs * 1024;
  if (mib < 0.5) return value < 0 ? '> -1 MiB' : '< 1 MiB';
  if (Math.round(mib) < 1024) return `${sign}${numberFormat(mib >= 10 ? 0 : 1).format(mib)} MiB`;
  if (abs >= 1024) return `${sign}${numberFormat(2).format(abs / 1024)} TiB`;
  return `${sign}${numberFormat(abs >= 100 ? 0 : 2).format(abs)} GiB`;
}

export const NO_PERCENT = '—';

/** Formats a percentage, e.g. "-4.9%", "< 0.1%"; undefined (no total to relate to) becomes a dash. */
export function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NO_PERCENT;
  if (value === 0) return '0%';
  const abs = Math.abs(value);
  if (abs < 0.05) return value < 0 ? '> -0.1%' : '< 0.1%';
  return `${value < 0 ? '-' : ''}${numberFormat(1).format(abs)}%`;
}

/** part as a percentage of total, undefined when the total is not positive (as the server's netPercent). */
export function percentOf(part: number, total: number | undefined): number | undefined {
  if (total === undefined || !(total > 0) || !Number.isFinite(part)) return undefined;
  return (part / total) * 100;
}

/** Whether a report carries the requested totals; servers before they were added omit them. */
export function hasRequestedTotals(report: SavingsReport): boolean {
  return [report.totals, ...report.byCluster, ...report.byNamespace].some(
    (g) => g.cpu.totalRequestedCores !== undefined || g.memory.totalRequestedGiB !== undefined,
  );
}

/** "412 cores requested, net -20 cores (-4.9%)". */
export function cpuNetChangeText(cpu: SavingsAmounts['cpu']): string {
  const total = cpu.totalRequestedCores === undefined ? NO_PERCENT : formatCores(cpu.totalRequestedCores);
  return `${total} requested, net ${formatCores(cpu.netCores)} (${formatPercent(cpu.netPercent)})`;
}

/** "1.5 TiB requested, net 300 GiB (19.5%)". */
export function memoryNetChangeText(memory: SavingsAmounts['memory']): string {
  const total = memory.totalRequestedGiB === undefined ? NO_PERCENT : formatGiB(memory.totalRequestedGiB);
  return `${total} requested, net ${formatGiB(memory.netGiB)} (${formatPercent(memory.netPercent)})`;
}

/** Formats an hourly cost; the unit is whatever the prices were given in. */
export function formatCostPerHour(amount: number): string {
  return `${numberFormat(2).format(Number.isFinite(amount) ? amount : 0)}/h`;
}

export const UNNAMED_CLUSTER_LABEL = '(default)';

/** Display name for a cluster; the server reports "" when no cluster label is configured. */
export function clusterLabel(cluster: string): string {
  return cluster.trim() || UNNAMED_CLUSTER_LABEL;
}

export interface ClusterSavings extends SavingsGroup {
  /** The byNamespace entries of the cluster, largest reclaimable CPU first. */
  namespaces: SavingsGroup[];
}

const sumKnown = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined ? undefined : a + b);

function addAmounts(target: SavingsGroup, group: SavingsGroup) {
  target.tailorings += group.tailorings;
  target.cpu.reclaimableCores += group.cpu.reclaimableCores;
  target.cpu.increaseCores += group.cpu.increaseCores;
  target.cpu.netCores += group.cpu.netCores;
  target.cpu.totalRequestedCores = sumKnown(target.cpu.totalRequestedCores, group.cpu.totalRequestedCores);
  target.cpu.netPercent = percentOf(target.cpu.netCores, target.cpu.totalRequestedCores);
  target.memory.reclaimableGiB += group.memory.reclaimableGiB;
  target.memory.increaseGiB += group.memory.increaseGiB;
  target.memory.netGiB += group.memory.netGiB;
  target.memory.totalRequestedGiB = sumKnown(target.memory.totalRequestedGiB, group.memory.totalRequestedGiB);
  target.memory.netPercent = percentOf(target.memory.netGiB, target.memory.totalRequestedGiB);
  if (group.cost) {
    target.cost ??= { reclaimablePerHour: 0, increasePerHour: 0, netPerHour: 0 };
    target.cost.reclaimablePerHour += group.cost.reclaimablePerHour;
    target.cost.increasePerHour += group.cost.increasePerHour;
    target.cost.netPerHour += group.cost.netPerHour;
  }
}

/**
 * Nests the flat byNamespace list under the byCluster entries. Namespaces of
 * a cluster missing from byCluster get a cluster entry summed from them.
 */
export function groupSavingsByCluster(report: SavingsReport): ClusterSavings[] {
  const clusters = new Map<string, ClusterSavings>();
  for (const group of report.byCluster) {
    if (!clusters.has(group.cluster)) clusters.set(group.cluster, { ...group, namespace: undefined, namespaces: [] });
  }
  const derived = new Set<string>();
  for (const ns of report.byNamespace) {
    let cluster = clusters.get(ns.cluster);
    if (!cluster) {
      cluster = {
        cluster: ns.cluster,
        tailorings: 0,
        cpu: { reclaimableCores: 0, increaseCores: 0, netCores: 0, totalRequestedCores: 0 },
        memory: { reclaimableGiB: 0, increaseGiB: 0, netGiB: 0, totalRequestedGiB: 0 },
        namespaces: [],
      };
      clusters.set(ns.cluster, cluster);
      derived.add(ns.cluster);
    }
    if (derived.has(ns.cluster)) addAmounts(cluster, ns);
    cluster.namespaces.push(ns);
  }
  for (const cluster of clusters.values()) {
    cluster.namespaces.sort(
      (a, b) => b.cpu.reclaimableCores - a.cpu.reclaimableCores || b.memory.reclaimableGiB - a.memory.reclaimableGiB,
    );
  }
  return [...clusters.values()];
}

export function skippedCount(counts: SavingsCounts): number {
  return counts.skippedNoAnalysis + counts.skippedNoReplicas + counts.skippedNoCurrentRequest;
}

/** Skipped Tailorings per reason, leaving out reasons with none. */
export function skippedBreakdown(counts: SavingsCounts): Array<{ key: keyof SavingsCounts; label: string; count: number }> {
  const reasons: Array<{ key: keyof SavingsCounts; label: string; count: number }> = [
    { key: 'skippedNoAnalysis', label: 'not analyzed yet', count: counts.skippedNoAnalysis },
    { key: 'skippedNoReplicas', label: 'no replica count', count: counts.skippedNoReplicas },
    { key: 'skippedNoCurrentRequest', label: 'no current request', count: counts.skippedNoCurrentRequest },
  ];
  return reasons.filter((r) => r.count > 0);
}

export type GainResource = 'cpu' | 'memory';

export function gainSaving(gain: ContainerGain, resource: GainResource): number | undefined {
  return resource === 'cpu' ? gain.cpuSavingCores : gain.memorySavingGiB;
}

/** The server's ranking for the resource, keeping only entries with something reclaimable. */
export function gainsFor(report: TopGainsReport, resource: GainResource, limit = 10): ContainerGain[] {
  return (resource === 'cpu' ? report.byCPU : report.byMemory)
    .filter((g) => (gainSaving(g, resource) ?? 0) > 0)
    .sort((a, b) => (gainSaving(b, resource) ?? 0) - (gainSaving(a, resource) ?? 0))
    .slice(0, limit);
}

export function tailoringPath(namespace: string, name: string): string {
  return `/tailorings/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

/** Analyzed with one of these reasons means the analysis succeeded with a caveat. */
export const WARNING_REASONS = new Set(['FitProfileFallback']);

export type AnalysisKind = 'analyzed' | 'warning' | 'failing' | 'pending';

export interface AnalysisDescription {
  kind: AnalysisKind;
  lastAnalysis?: Date;
  reason?: string;
  message?: string;
  consecutiveFailures: number;
  nextAnalysis?: { at: Date; overdue: boolean };
}

export const UNKNOWN_REASON = 'Unknown';

export function describeAnalysis(summary: TailoringSummary, now: Date = new Date()): AnalysisDescription {
  const state = tailoringAnalysisState(summary);
  const last = summary.lastAnalysis ? new Date(summary.lastAnalysis) : undefined;
  const lastAnalysis = last && !Number.isNaN(last.getTime()) ? last : undefined;
  let kind: AnalysisKind;
  if (state.status === 'False') kind = 'failing';
  else if (state.status === 'True' && state.reason && WARNING_REASONS.has(state.reason)) kind = 'warning';
  else if (state.status === 'True' || lastAnalysis) kind = 'analyzed';
  else kind = 'pending';
  return {
    kind,
    lastAnalysis,
    reason: kind === 'failing' ? state.reason ?? UNKNOWN_REASON : state.reason,
    message: state.message,
    consecutiveFailures: state.consecutiveFailures,
    nextAnalysis: state.nextAnalysisTime
      ? { at: state.nextAnalysisTime, overdue: state.nextAnalysisTime.getTime() <= now.getTime() }
      : undefined,
  };
}

export interface ReasonCount {
  reason: string;
  count: number;
}

export interface AnalysisHealth {
  analyzed: number;
  /** Analyzed with a caveat, e.g. a FitProfile fallback. */
  warning: number;
  pending: number;
  failing: number;
  /** Per reason, most common first. */
  warningByReason: ReasonCount[];
  failingByReason: ReasonCount[];
}

function byCount(reasons: Map<string, number>): ReasonCount[] {
  return [...reasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

export function analysisHealth(summaries: TailoringSummary[], now: Date = new Date()): AnalysisHealth {
  const health: AnalysisHealth = { analyzed: 0, warning: 0, pending: 0, failing: 0, warningByReason: [], failingByReason: [] };
  const failing = new Map<string, number>();
  const warning = new Map<string, number>();
  for (const summary of summaries) {
    const d = describeAnalysis(summary, now);
    health[d.kind] += 1;
    const reasons = d.kind === 'failing' ? failing : d.kind === 'warning' ? warning : undefined;
    if (reasons) {
      const reason = d.reason ?? UNKNOWN_REASON;
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
  }
  health.failingByReason = byCount(failing);
  health.warningByReason = byCount(warning);
  return health;
}

export function isOpenCostReady(health?: OpenCostHealthStatus): boolean {
  return !!health?.enabled && !!health.connected;
}

export function openCostProblem(health: QueryView<OpenCostHealthStatus>): string | undefined {
  if (health.error && !health.data) {
    const message = health.error instanceof Error ? health.error.message : String(health.error);
    return `Unable to check OpenCost status: ${message || 'Unknown error'}`;
  }
  if (!health.data?.enabled) return 'OpenCost integration is not enabled. Configure it in your Atelier resource.';
  if (!health.data.connected) return `Unable to connect to OpenCost: ${health.data.error || 'Unknown error'}`;
  return undefined;
}
