import { tailoringAnalysisState, type OpenCostHealthStatus, type TailoringSummary, type TopGain } from './api';

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

export function formatCost(amount: number, currency: string, period?: string): string {
  let text: string;
  try {
    text = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    text = `${numberFormat(2).format(amount)} ${currency}`;
  }
  return period ? `${text}/${period}` : text;
}

export const UNNAMED_CLUSTER_LABEL = '(default)';

/** Display name for a cluster; the server reports "" when no cluster label is configured. */
export function clusterLabel(cluster: string): string {
  return cluster.trim() || UNNAMED_CLUSTER_LABEL;
}

export type GainResource = 'cpu' | 'memory';

export function gainValue(gain: TopGain, resource: GainResource): number {
  return resource === 'cpu' ? gain.reclaimableCpuCores : gain.reclaimableMemoryGiB;
}

/** Entries with something reclaimable for the resource, largest first. */
export function rankGains(gains: TopGain[], resource: GainResource, limit = 10): TopGain[] {
  return gains
    .filter((g) => gainValue(g, resource) > 0)
    .sort((a, b) => gainValue(b, resource) - gainValue(a, resource))
    .slice(0, limit);
}

export function tailoringPath(namespace: string, name: string): string {
  return `/tailorings/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export type AnalysisKind = 'analyzed' | 'failing' | 'pending';

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

export interface AnalysisHealth {
  analyzed: number;
  pending: number;
  failing: number;
  /** Failing Tailorings per reason, most common first. */
  failingByReason: Array<{ reason: string; count: number }>;
}

export function analysisHealth(summaries: TailoringSummary[], now: Date = new Date()): AnalysisHealth {
  const health: AnalysisHealth = { analyzed: 0, pending: 0, failing: 0, failingByReason: [] };
  const reasons = new Map<string, number>();
  for (const summary of summaries) {
    const d = describeAnalysis(summary, now);
    health[d.kind] += 1;
    if (d.kind === 'failing') {
      const reason = d.reason ?? UNKNOWN_REASON;
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
  }
  health.failingByReason = [...reasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
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
