import axios from 'axios';

// Empty means same-origin: /api is proxied by nginx in the image and by Vite in dev.
// The API key is never part of the bundle; nginx injects it server-side (SARTOR_API_KEY).
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface TailoringSummary {
  name: string;
  namespace: string;
  targetKind: string;
  targetName: string;
  intent?: string; // Deprecated, use fitProfile
  fitProfile?: string;
  paused: boolean;
  targetFound: boolean;
  vpaDetected: boolean;
  lastAnalysis?: string;
  containerCount: number;
  readyCondition: string;
  prState?: string;
  prNumber?: number;
  prUrl?: string;
  // Analysis health; older servers omit these fields. Read them through
  // tailoringAnalysisState() rather than directly.
  analyzedStatus?: string;
  analyzedReason?: string;
  analyzedMessage?: string;
  analyzedCondition?: { status?: string; reason?: string; message?: string };
  nextAnalysisTime?: string;
  consecutiveFailures?: number;
}

export interface TailoringAnalysisState {
  /** Status of the Analyzed condition ("True", "False", "Unknown"), if the server reports one. */
  status?: string;
  reason?: string;
  message?: string;
  /** Parsed nextAnalysisTime; undefined when missing or unparseable. */
  nextAnalysisTime?: Date;
  consecutiveFailures: number;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function tailoringAnalysisState(summary: TailoringSummary): TailoringAnalysisState {
  const condition = summary.analyzedCondition && typeof summary.analyzedCondition === 'object' ? summary.analyzedCondition : undefined;
  const next = nonEmptyString(summary.nextAnalysisTime);
  const nextDate = next ? new Date(next) : undefined;
  const failures = Number(summary.consecutiveFailures);
  return {
    status: nonEmptyString(summary.analyzedStatus) ?? nonEmptyString(condition?.status),
    reason: nonEmptyString(summary.analyzedReason) ?? nonEmptyString(condition?.reason),
    message: nonEmptyString(summary.analyzedMessage) ?? nonEmptyString(condition?.message),
    nextAnalysisTime: nextDate && !Number.isNaN(nextDate.getTime()) ? nextDate : undefined,
    consecutiveFailures: Number.isFinite(failures) && failures > 0 ? Math.floor(failures) : 0,
  };
}

export interface Tailoring {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
  };
  spec: {
    target: {
      kind: string;
      name: string;
      namespace?: string;
      cluster?: string;
    };
    fitProfileRef: {
      name: string;
      namespace?: string;
    };
    writeBack: {
      repository: string;
      path: string;
      branch?: string;
      type: string;
    };
    paused: boolean;
  };
  status: {
    conditions?: Array<{
      type: string;
      status: string;
      reason: string;
      message: string;
    }>;
    lastAnalysis?: {
      timestamp: string;
      analysisWindow?: string;
      containers?: Array<{
        name: string;
        current?: {
          requests?: {
            cpu?: string;
            memory?: string;
          };
          limits?: {
            cpu?: string;
            memory?: string;
          };
        };
        recommended?: {
          requests?: {
            cpu?: string;
            memory?: string;
          };
          limits?: {
            cpu?: string;
            memory?: string;
          };
        };
        p95CPU?: string;
        p99CPU?: string;
        p95Memory?: string;
        p99Memory?: string;
      }>;
      savingsEstimate?: string;
    };
    prState?: string;
    prUrl?: string;
    prNumber?: number;
    commitSHA?: string;
    branchName?: string;
    ignored?: boolean;
    mergedAt?: string;
    message?: string;
    argoCDApp?: string;
    argoCDSyncTriggered?: boolean;
    argoCDSyncTime?: string;
    analysisTimestampWhenPRCreated?: string;
  };
}


export interface FitProfile {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    strategy: string;
    displayName?: string;
    description?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters?: Record<string, any> | { raw?: string };
    priority?: number;
    labels?: Record<string, string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    safetyRailsOverride?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resourceQuotaOverride?: any;
  };
  status?: {
    strategyValid?: boolean;
    parametersValid?: boolean;
    validationMessage?: string;
    usageCount?: number;
    lastValidated?: string;
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
      lastTransitionTime?: string;
    }>;
  };
}

export interface Strategy {
  name: string;
  displayName: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parametersSchema?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exampleParameters?: Record<string, any>;
}

export interface AtelierSummary {
  name: string;
  prometheusUrl: string;
  prometheusConnected: boolean;
  gitProviderType: string;
  gitProviderConnected: boolean;
  argoCDEnabled: boolean;
  argoCDConnected: boolean;
  openCostEnabled: boolean;
  openCostConnected: boolean;
  openCostUrl?: string;
  managedTailorings: number;
  batchMode: boolean;
}

// OpenCost Types
export interface OpenCostAllocation {
  name: string;
  cluster?: string;
  namespace?: string;
  controller?: string;
  controllerKind?: string;
  pod?: string;
  container?: string;
  cpuCores: number;
  cpuCost: number;
  cpuEfficiency: number;
  ramBytes: number;
  ramCost: number;
  ramEfficiency: number;
  gpuCost: number;
  pvCost: number;
  networkCost: number;
  loadBalancerCost: number;
  sharedCost: number;
  totalCost: number;
  totalEfficiency: number;
}

export interface OpenCostSummary {
  totalCost: number;
  cpuCost: number;
  ramCost: number;
  gpuCost: number;
  pvCost: number;
  networkCost: number;
  loadBalancerCost: number;
  sharedCost: number;
  efficiency: number;
  cpuEfficiency: number;
  ramEfficiency: number;
  byNamespace?: Record<string, number>;
}

export interface OpenCostHealthStatus {
  connected: boolean;
  enabled: boolean;
  error?: string;
}

// OpenCost Analytics Types (from Prometheus metrics exporter)
export interface ResourceConsumer {
  name: string;
  namespace: string;
  pod: string;
  container: string;
  value: number;
  percent: number;
}

export interface ResourceAnalytics {
  totalCpuCapacity: number;
  totalMemoryCapacity: number;
  totalCpuAllocatable: number;
  totalMemoryAllocatable: number;
  totalCpuAllocated: number;
  totalMemoryAllocated: number;
  totalGpuAllocated: number;
  cpuUtilizationPercent: number;
  memoryUtilizationPercent: number;
  cpuByNamespace: Record<string, number>;
  memoryByNamespace: Record<string, number>;
  cpuByPod: Record<string, number>;
  memoryByPod: Record<string, number>;
  topCpuConsumers: ResourceConsumer[];
  topMemoryConsumers: ResourceConsumer[];
}

export interface NodeCostSummary {
  node: string;
  cpuHourlyCost: number;
  ramHourlyCost: number;
  gpuHourlyCost: number;
  totalHourlyCost: number;
  gpuCount: number;
}

export interface CostAnalytics {
  totalHourlyCost: number;
  cpuHourlyCost: number;
  ramHourlyCost: number;
  gpuHourlyCost: number;
  storageHourlyCost: number;
  networkHourlyCost: number;
  loadBalancerHourlyCost: number;
  clusterManagementCost: number;
  dailyCost: number;
  monthlyCost: number;
  costByNamespace: Record<string, number>;
  nodeCosts: NodeCostSummary[];
}

export interface ClusterResourceSummary {
  totalNodes: number;
  totalCpuCores: number;
  totalMemoryGb: number;
  allocatedCpuCores: number;
  allocatedMemoryGb: number;
  availableCpuCores: number;
  availableMemoryGb: number;
  cpuUtilization: number;
  memoryUtilization: number;
  totalPods: number;
  totalContainers: number;
  totalNamespaces: number;
}

export interface ContainerBreakdown {
  container: string;
  pod: string;
  cpu: number;
  memory: number;
  gpu: number;
}

export interface NamespaceResourceBreakdown {
  namespace: string;
  totalCpu: number;
  totalMemory: number;
  totalGpu: number;
  cpuPercent: number;
  memoryPercent: number;
  containers: ContainerBreakdown[];
}

export interface DashboardStats {
  totalTailorings: number;
  activeTailorings: number;
  pausedTailorings: number;
  openPRs: number;
  mergedPRs: number;
  closedPRs: number;
  ignoredPRs: number;
  totalFitProfiles: number;
  totalSavings?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PrometheusMetricsTarget {
  // Required by the server when the Atelier sets prometheus.clusterLabel.
  cluster?: string;
  // Workload kind; the server assumes Deployment when it is omitted.
  kind?: string;
}

export function prometheusMetricsParams(
  namespace: string,
  podNamePrefix: string,
  containerName: string,
  resourceType: 'cpu' | 'memory',
  window?: string,
  target?: PrometheusMetricsTarget
): Record<string, string> {
  const params: Record<string, string> = {
    namespace,
    podNamePrefix,
    containerName,
    resourceType,
  };
  if (window) {
    params.window = window;
  }
  if (target?.cluster) {
    params.cluster = target.cluster;
  }
  if (target?.kind) {
    params.kind = target.kind;
  }
  return params;
}

export const DEFAULT_FORECAST_HORIZON = '24h';
export const DEFAULT_FORECAST_CONFIDENCE = 0.95;

export interface ForecastOptions {
  /** Go duration, e.g. "24h". */
  horizon?: string;
  /** Interval level in (0, 1), e.g. 0.95. */
  confidence?: number;
}

/** Values use the units of the metrics endpoint: cores for CPU, MiB for memory. */
export interface PrometheusForecast {
  history: Array<{ timestamp: number; value: number }>;
  forecast: Array<{ timestamp: number; value: number; lower: number; upper: number }>;
  level: number;
  model: string;
  sampleInterval: number | string;
  fallbackReason?: string;
}

/** The server has no forecast endpoint (it predates it). */
export class ForecastUnavailableError extends Error {
  constructor(message = 'Forecasting is not available on this server. It needs a newer Sartor server version.') {
    super(message);
    this.name = 'ForecastUnavailableError';
  }
}

export function forecastParams(
  namespace: string,
  podNamePrefix: string,
  containerName: string,
  resourceType: 'cpu' | 'memory',
  window?: string,
  target?: PrometheusMetricsTarget,
  options?: ForecastOptions
): Record<string, string> {
  return {
    ...prometheusMetricsParams(namespace, podNamePrefix, containerName, resourceType, window, target),
    horizon: options?.horizon || DEFAULT_FORECAST_HORIZON,
    confidence: String(options?.confidence ?? DEFAULT_FORECAST_CONFIDENCE),
  };
}

/**
 * Converts a failed forecast request into an Error carrying the server's
 * message. A 404 without a JSON error body comes from a server without the
 * endpoint and becomes a ForecastUnavailableError.
 */
export function forecastError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const body: unknown = err.response?.data;
    const serverMessage =
      body && typeof body === 'object' && typeof (body as ApiResponse<unknown>).error === 'string'
        ? (body as ApiResponse<unknown>).error?.trim()
        : undefined;
    if (serverMessage) return new Error(serverMessage);
    if (err.response?.status === 404) return new ForecastUnavailableError();
    if (err.response) return new Error(`Forecast request failed with status ${err.response.status}`);
    return new Error(err.message || 'Forecast request failed');
  }
  return err instanceof Error ? err : new Error(String(err));
}

export const ANALYTICS_PATHS = {
  savings: '/api/v1/analytics/savings',
  topGains: '/api/v1/analytics/top-gains',
} as const;

/** The server does not have the requested endpoint (it predates it). */
export class EndpointUnavailableError extends Error {
  constructor(message = 'This needs a newer Sartor server version.') {
    super(message);
    this.name = 'EndpointUnavailableError';
  }
}

/**
 * Converts a failed request into an Error carrying the server's message. A 404
 * without a JSON error body comes from a server without the endpoint and
 * becomes an EndpointUnavailableError.
 */
export function endpointError(err: unknown, what: string): Error {
  if (axios.isAxiosError(err)) {
    const body: unknown = err.response?.data;
    const serverMessage =
      body && typeof body === 'object' && typeof (body as ApiResponse<unknown>).error === 'string'
        ? (body as ApiResponse<unknown>).error?.trim()
        : undefined;
    if (err.response?.status === 404 && !serverMessage) return new EndpointUnavailableError();
    if (serverMessage) return new Error(serverMessage);
    if (err.response) return new Error(`${what} request failed with status ${err.response.status}`);
    return new Error(err.message || `${what} request failed`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** Requested-resource deltas, computed by the server as (current - recommended request) x replicas. */
export interface SavingsAmounts {
  reclaimableCpuCores: number;
  reclaimableMemoryGiB: number;
  neededCpuCores: number;
  neededMemoryGiB: number;
  /** Tailorings whose recommendations went into the totals. */
  included: number;
  /** Tailorings left out, e.g. not analyzed yet or without a recommendation. */
  skipped: number;
  /** Only present when the request carried price parameters. */
  cost?: SavingsCost;
}

export interface SavingsCost {
  currency: string;
  /** E.g. "month"; the period the amounts cover. */
  period?: string;
  reclaimable: number;
  needed: number;
}

export interface NamespaceSavings extends SavingsAmounts {
  namespace: string;
}

export interface ClusterSavings extends SavingsAmounts {
  /** Empty when the server has no cluster label configured. */
  cluster: string;
  namespaces: NamespaceSavings[];
}

export interface SavingsSummary {
  clusters: ClusterSavings[];
  totals: SavingsAmounts;
}

export interface SavingsPriceParams {
  cpuPricePerCoreHour?: number;
  memoryPricePerGiBHour?: number;
  currency?: string;
}

export interface TopGain {
  cluster: string;
  namespace: string;
  /** Name of the Tailoring, used to link to its detail page. */
  tailoring?: string;
  targetKind?: string;
  targetName?: string;
  container: string;
  replicas?: number;
  reclaimableCpuCores: number;
  reclaimableMemoryGiB: number;
}

function finiteNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function count(value: unknown): number {
  return Math.max(0, Math.round(finiteNumber(value)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeCost(raw: unknown): SavingsCost | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = asRecord(raw);
  return {
    currency: nonEmptyString(c.currency) ?? 'USD',
    period: nonEmptyString(c.period),
    reclaimable: finiteNumber(c.reclaimable),
    needed: finiteNumber(c.needed),
  };
}

function normalizeAmounts(raw: unknown): SavingsAmounts {
  const r = asRecord(raw);
  const amounts: SavingsAmounts = {
    reclaimableCpuCores: finiteNumber(r.reclaimableCpuCores),
    reclaimableMemoryGiB: finiteNumber(r.reclaimableMemoryGiB),
    neededCpuCores: finiteNumber(r.neededCpuCores),
    neededMemoryGiB: finiteNumber(r.neededMemoryGiB),
    included: count(r.included),
    skipped: count(r.skipped),
  };
  const cost = normalizeCost(r.cost);
  if (cost) amounts.cost = cost;
  return amounts;
}

function sumAmounts(items: SavingsAmounts[]): SavingsAmounts {
  const total: SavingsAmounts = {
    reclaimableCpuCores: 0,
    reclaimableMemoryGiB: 0,
    neededCpuCores: 0,
    neededMemoryGiB: 0,
    included: 0,
    skipped: 0,
  };
  for (const item of items) {
    total.reclaimableCpuCores += item.reclaimableCpuCores;
    total.reclaimableMemoryGiB += item.reclaimableMemoryGiB;
    total.neededCpuCores += item.neededCpuCores;
    total.neededMemoryGiB += item.neededMemoryGiB;
    total.included += item.included;
    total.skipped += item.skipped;
    if (item.cost) {
      total.cost ??= { currency: item.cost.currency, period: item.cost.period, reclaimable: 0, needed: 0 };
      total.cost.reclaimable += item.cost.reclaimable;
      total.cost.needed += item.cost.needed;
    }
  }
  return total;
}

/** Coerces a savings response into SavingsSummary, tolerating missing or malformed fields. */
export function normalizeSavings(raw: unknown): SavingsSummary {
  const r = asRecord(raw);
  const clusters: ClusterSavings[] = (Array.isArray(r.clusters) ? r.clusters : []).map((c) => {
    const cluster = asRecord(c);
    const namespaces = (Array.isArray(cluster.namespaces) ? cluster.namespaces : [])
      .map((n) => ({ namespace: nonEmptyString(asRecord(n).namespace) ?? '', ...normalizeAmounts(n) }))
      .sort((a, b) => b.reclaimableCpuCores - a.reclaimableCpuCores || b.reclaimableMemoryGiB - a.reclaimableMemoryGiB);
    return { cluster: nonEmptyString(cluster.cluster) ?? '', namespaces, ...normalizeAmounts(c) };
  });
  const totals = r.totals && typeof r.totals === 'object' ? normalizeAmounts(r.totals) : sumAmounts(clusters);
  // Some responses report the counts at the top level only.
  if (r.included !== undefined) totals.included = count(r.included);
  if (r.skipped !== undefined) totals.skipped = count(r.skipped);
  return { clusters, totals };
}

function normalizeTopGain(raw: unknown): TopGain {
  const g = asRecord(raw);
  const replicas = finiteNumber(g.replicas);
  return {
    cluster: nonEmptyString(g.cluster) ?? '',
    namespace: nonEmptyString(g.namespace) ?? '',
    tailoring: nonEmptyString(g.tailoring) ?? nonEmptyString(g.tailoringName),
    targetKind: nonEmptyString(g.targetKind),
    targetName: nonEmptyString(g.targetName),
    container: nonEmptyString(g.container) ?? '',
    replicas: replicas > 0 ? replicas : undefined,
    reclaimableCpuCores: finiteNumber(g.reclaimableCpuCores),
    reclaimableMemoryGiB: finiteNumber(g.reclaimableMemoryGiB),
  };
}

/**
 * Accepts either one list (each entry carries both resources) or separate
 * `cpu` and `memory` rankings, and returns a single de-duplicated list.
 */
export function normalizeTopGains(raw: unknown): TopGain[] {
  const lists: unknown[][] = Array.isArray(raw)
    ? [raw]
    : [asRecord(raw).items, asRecord(raw).cpu, asRecord(raw).memory].filter((l): l is unknown[] => Array.isArray(l));
  const seen = new Map<string, TopGain>();
  for (const gain of lists.flat().map(normalizeTopGain)) {
    const key = [gain.cluster, gain.namespace, gain.tailoring, gain.targetName, gain.container].join('\u0000');
    if (!seen.has(key)) seen.set(key, gain);
  }
  return [...seen.values()];
}

export function savingsParams(prices?: SavingsPriceParams): Record<string, string> {
  const params: Record<string, string> = {};
  if (prices?.cpuPricePerCoreHour !== undefined && Number.isFinite(prices.cpuPricePerCoreHour)) {
    params.cpuPricePerCoreHour = String(prices.cpuPricePerCoreHour);
  }
  if (prices?.memoryPricePerGiBHour !== undefined && Number.isFinite(prices.memoryPricePerGiBHour)) {
    params.memoryPricePerGiBHour = String(prices.memoryPricePerGiBHour);
  }
  if (prices?.currency) params.currency = prices.currency;
  return params;
}

async function getAnalytics<T>(path: string, what: string, params: Record<string, string>): Promise<T | undefined> {
  let body: ApiResponse<T>;
  try {
    body = (await api.get<ApiResponse<T>>(path, { params })).data;
  } catch (err) {
    throw endpointError(err, what);
  }
  if (body && typeof body === 'object' && body.success === false) {
    throw new Error((typeof body.error === 'string' && body.error.trim()) || `${what} request failed`);
  }
  return body?.data;
}

export interface TailoringMetricsTarget extends PrometheusMetricsTarget {
  namespace: string;
  name: string;
}

/**
 * Returns the workload whose metrics belong to a Tailoring. The target may live
 * in another namespace; when spec.target.namespace is unset it defaults to the
 * Tailoring's own namespace, as on the server.
 */
export function tailoringMetricsTarget(tailoring: Pick<Tailoring, 'metadata' | 'spec'>): TailoringMetricsTarget {
  const { target } = tailoring.spec;
  return {
    namespace: target.namespace || tailoring.metadata.namespace,
    name: target.name,
    cluster: target.cluster,
    kind: target.kind,
  };
}

export const apiClient = {
  // Tailorings
  listTailorings: async (namespace?: string): Promise<TailoringSummary[]> => {
    const params = namespace ? { namespace } : {};
    const response = await api.get<ApiResponse<TailoringSummary[]>>('/api/v1/tailorings', { params });
    return response.data.data || [];
  },

  getTailoring: async (namespace: string, name: string): Promise<Tailoring> => {
    const response = await api.get<ApiResponse<Tailoring>>(`/api/v1/tailorings/${namespace}/${name}`);
    if (!response.data.data) throw new Error('Tailoring not found');
    return response.data.data;
  },


  // FitProfiles
  listFitProfiles: async (namespace?: string): Promise<FitProfile[]> => {
    const params = namespace ? { namespace } : {};
    const response = await api.get<ApiResponse<FitProfile[]>>('/api/v1/fitprofiles', { params });
    return response.data.data || [];
  },

  getFitProfile: async (namespace: string, name: string): Promise<FitProfile> => {
    const response = await api.get<ApiResponse<FitProfile>>(`/api/v1/fitprofiles/${namespace}/${name}`);
    if (!response.data.data) throw new Error('FitProfile not found');
    return response.data.data;
  },

  // Strategies
  listStrategies: async (): Promise<Strategy[]> => {
    const response = await api.get<ApiResponse<Strategy[]>>('/api/v1/strategies');
    return response.data.data || [];
  },

  getStrategy: async (name: string): Promise<Strategy> => {
    const response = await api.get<ApiResponse<Strategy>>(`/api/v1/strategies/${name}`);
    if (!response.data.data) throw new Error('Strategy not found');
    return response.data.data;
  },

  // Atelier
  getAtelier: async (): Promise<AtelierSummary> => {
    const response = await api.get<ApiResponse<AtelierSummary>>('/api/v1/atelier');
    if (!response.data.data) throw new Error('Atelier not found');
    return response.data.data;
  },

  // Dashboard
  getDashboardStats: async (): Promise<DashboardStats> => {
    const response = await api.get<ApiResponse<DashboardStats>>('/api/v1/dashboard/stats');
    return response.data.data || {
      totalTailorings: 0,
      activeTailorings: 0,
      pausedTailorings: 0,
      openPRs: 0,
      mergedPRs: 0,
      closedPRs: 0,
      ignoredPRs: 0,
      totalFitProfiles: 0,
    };
  },

  // Prometheus Metrics
  getPrometheusMetrics: async (
    namespace: string,
    podNamePrefix: string,
    containerName: string,
    resourceType: 'cpu' | 'memory',
    window?: string,
    target?: PrometheusMetricsTarget
  ): Promise<Array<{ timestamp: number; value: number; pod?: string }>> => {
    const params = prometheusMetricsParams(namespace, podNamePrefix, containerName, resourceType, window, target);
    const response = await api.get<ApiResponse<Array<{ timestamp: number; value: number; pod?: string }>>>(
      '/api/v1/prometheus/metrics',
      { params }
    );
    return response.data.data || [];
  },

  // Prometheus Metrics with per-pod breakdown
  getPrometheusMetricsPerPod: async (
    namespace: string,
    podNamePrefix: string,
    containerName: string,
    resourceType: 'cpu' | 'memory',
    window?: string,
    target?: PrometheusMetricsTarget
  ): Promise<Array<{ timestamp: number; value: number; pod: string }>> => {
    const params = {
      ...prometheusMetricsParams(namespace, podNamePrefix, containerName, resourceType, window, target),
      perPod: 'true',
    };
    const response = await api.get<ApiResponse<Array<{ timestamp: number; value: number; pod: string }>>>(
      '/api/v1/prometheus/metrics',
      { params }
    );
    return response.data.data || [];
  },

  // Unlike the metrics calls, failures are thrown with the server's message
  // instead of becoming an empty series.
  getPrometheusForecast: async (
    namespace: string,
    podNamePrefix: string,
    containerName: string,
    resourceType: 'cpu' | 'memory',
    window?: string,
    target?: PrometheusMetricsTarget,
    options?: ForecastOptions
  ): Promise<PrometheusForecast> => {
    const params = forecastParams(namespace, podNamePrefix, containerName, resourceType, window, target, options);
    let body: ApiResponse<PrometheusForecast>;
    try {
      body = (await api.get<ApiResponse<PrometheusForecast>>('/api/v1/prometheus/forecast', { params })).data;
    } catch (err) {
      throw forecastError(err);
    }
    if (!body || typeof body !== 'object' || body.success === false || !body.data || typeof body.data !== 'object') {
      throw new Error((typeof body?.error === 'string' && body.error.trim()) || 'The server returned no forecast');
    }
    return body.data;
  },

  // Right-sizing analytics; these do not depend on OpenCost. A server without
  // the endpoint rejects with EndpointUnavailableError.
  getSavingsSummary: async (prices?: SavingsPriceParams): Promise<SavingsSummary> =>
    normalizeSavings(await getAnalytics<unknown>(ANALYTICS_PATHS.savings, 'Savings', savingsParams(prices))),

  getTopGains: async (limit = 10): Promise<TopGain[]> => {
    const params = { limit: String(Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 10) };
    return normalizeTopGains(await getAnalytics<unknown>(ANALYTICS_PATHS.topGains, 'Top gains', params));
  },

  // OpenCost APIs
  getOpenCostAllocations: async (
    window: string = '7d',
    aggregate: string = 'namespace'
  ): Promise<OpenCostAllocation[]> => {
    const params = { window, aggregate };
    const response = await api.get<ApiResponse<OpenCostAllocation[]>>(
      '/api/v1/opencost/allocations',
      { params }
    );
    return response.data.data || [];
  },

  getOpenCostSummary: async (window: string = '7d'): Promise<OpenCostSummary> => {
    const params = { window };
    const response = await api.get<ApiResponse<OpenCostSummary>>(
      '/api/v1/opencost/summary',
      { params }
    );
    return response.data.data || {
      totalCost: 0,
      cpuCost: 0,
      ramCost: 0,
      gpuCost: 0,
      pvCost: 0,
      networkCost: 0,
      loadBalancerCost: 0,
      sharedCost: 0,
      efficiency: 0,
      cpuEfficiency: 0,
      ramEfficiency: 0,
    };
  },

  getOpenCostNamespaceCosts: async (window: string = '7d'): Promise<OpenCostAllocation[]> => {
    const params = { window };
    const response = await api.get<ApiResponse<OpenCostAllocation[]>>(
      '/api/v1/opencost/namespaces',
      { params }
    );
    return response.data.data || [];
  },

  getOpenCostControllerCosts: async (
    window: string = '7d',
    namespace?: string
  ): Promise<OpenCostAllocation[]> => {
    const params: Record<string, string> = { window };
    if (namespace) {
      params.namespace = namespace;
    }
    const response = await api.get<ApiResponse<OpenCostAllocation[]>>(
      '/api/v1/opencost/controllers',
      { params }
    );
    return response.data.data || [];
  },

  getOpenCostHealth: async (): Promise<OpenCostHealthStatus> => {
    const response = await api.get<ApiResponse<OpenCostHealthStatus>>(
      '/api/v1/opencost/health'
    );
    return response.data.data || { connected: false, enabled: false };
  },

  // OpenCost Analytics APIs (from Prometheus metrics exporter)
  getOpenCostResourceAnalytics: async (): Promise<ResourceAnalytics> => {
    const response = await api.get<ApiResponse<ResourceAnalytics>>(
      '/api/v1/opencost/analytics/resources'
    );
    return response.data.data || {
      totalCpuCapacity: 0,
      totalMemoryCapacity: 0,
      totalCpuAllocatable: 0,
      totalMemoryAllocatable: 0,
      totalCpuAllocated: 0,
      totalMemoryAllocated: 0,
      totalGpuAllocated: 0,
      cpuUtilizationPercent: 0,
      memoryUtilizationPercent: 0,
      cpuByNamespace: {},
      memoryByNamespace: {},
      cpuByPod: {},
      memoryByPod: {},
      topCpuConsumers: [],
      topMemoryConsumers: [],
    };
  },

  getOpenCostCostAnalytics: async (): Promise<CostAnalytics> => {
    const response = await api.get<ApiResponse<CostAnalytics>>(
      '/api/v1/opencost/analytics/costs'
    );
    return response.data.data || {
      totalHourlyCost: 0,
      cpuHourlyCost: 0,
      ramHourlyCost: 0,
      gpuHourlyCost: 0,
      storageHourlyCost: 0,
      networkHourlyCost: 0,
      loadBalancerHourlyCost: 0,
      clusterManagementCost: 0,
      dailyCost: 0,
      monthlyCost: 0,
      costByNamespace: {},
      nodeCosts: [],
    };
  },

  getOpenCostClusterSummary: async (): Promise<ClusterResourceSummary> => {
    const response = await api.get<ApiResponse<ClusterResourceSummary>>(
      '/api/v1/opencost/analytics/cluster'
    );
    return response.data.data || {
      totalNodes: 0,
      totalCpuCores: 0,
      totalMemoryGb: 0,
      allocatedCpuCores: 0,
      allocatedMemoryGb: 0,
      availableCpuCores: 0,
      availableMemoryGb: 0,
      cpuUtilization: 0,
      memoryUtilization: 0,
      totalPods: 0,
      totalContainers: 0,
      totalNamespaces: 0,
    };
  },

  getOpenCostNamespaceBreakdown: async (namespace: string): Promise<NamespaceResourceBreakdown> => {
    const response = await api.get<ApiResponse<NamespaceResourceBreakdown>>(
      `/api/v1/opencost/namespace/${namespace}`
    );
    return response.data.data || {
      namespace,
      totalCpu: 0,
      totalMemory: 0,
      totalGpu: 0,
      cpuPercent: 0,
      memoryPercent: 0,
      containers: [],
    };
  },
};

export default api;
