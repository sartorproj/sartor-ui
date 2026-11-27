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
  /** Status of the Analyzed condition: "True", "False" or "Unknown". */
  analyzedCondition?: string;
  analyzedReason?: string;
  analyzedMessage?: string;
  /** RFC 3339. */
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
  const next = nonEmptyString(summary.nextAnalysisTime);
  const nextDate = next ? new Date(next) : undefined;
  const failures = Number(summary.consecutiveFailures);
  return {
    status: nonEmptyString(summary.analyzedCondition),
    reason: nonEmptyString(summary.analyzedReason),
    message: nonEmptyString(summary.analyzedMessage),
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

export const MAX_TOP_GAINS_LIMIT = 200;

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

/** CPU request change in cores, summed over containers and multiplied by replicas. */
export interface CpuSavings {
  /** Sum of request decreases (current above recommended). */
  reclaimableCores: number;
  /** Sum of request increases (recommended above current). */
  increaseCores: number;
  /** reclaimableCores - increaseCores. */
  netCores: number;
  /** Current requests x replicas of the included Tailorings; undefined from a server that predates it. */
  totalRequestedCores?: number;
  /** netCores as a percentage of totalRequestedCores, negative for a net increase; undefined when the total is zero or the server predates it. */
  netPercent?: number;
}

/** Memory request change in GiB, summed over containers and multiplied by replicas. */
export interface MemorySavings {
  reclaimableGiB: number;
  increaseGiB: number;
  netGiB: number;
  totalRequestedGiB?: number;
  netPercent?: number;
}

/** Hourly cost of the request change, in the unit of the prices sent with the request. */
export interface CostSavings {
  reclaimablePerHour: number;
  increasePerHour: number;
  netPerHour: number;
}

export interface SavingsAmounts {
  cpu: CpuSavings;
  memory: MemorySavings;
  /** Only present when the request carried a price. */
  cost?: CostSavings;
}

export interface SavingsGroup extends SavingsAmounts {
  /** spec.target.cluster; empty when the Tailorings set none. */
  cluster: string;
  /** Workload namespace; only set in byNamespace. */
  namespace?: string;
  /** Included Tailorings in the group. */
  tailorings: number;
}

/** Which Tailorings a result covers. */
export interface SavingsCounts {
  total: number;
  included: number;
  skippedNoAnalysis: number;
  skippedNoReplicas: number;
  skippedNoCurrentRequest: number;
}

export interface SavingsPricing {
  cpuPricePerCoreHour?: number;
  memPricePerGiBHour?: number;
}

export interface SavingsReport {
  totals: SavingsAmounts;
  byCluster: SavingsGroup[];
  /** Flat list keyed by cluster and namespace. */
  byNamespace: SavingsGroup[];
  tailorings: SavingsCounts;
  /** Echo of the prices used for the cost figures. */
  pricing?: SavingsPricing;
}

/** Kubernetes quantities as serialized by the server, e.g. "250m", "512Mi". */
export interface ResourceValues {
  cpu?: string;
  memory?: string;
}

export interface ContainerGain {
  cluster: string;
  /** Namespace and name of the Tailoring. */
  namespace: string;
  tailoring: string;
  workloadKind: string;
  workloadName: string;
  workloadNamespace: string;
  container: string;
  replicas: number;
  /** Per-pod requests. */
  currentRequests?: ResourceValues;
  recommendedRequests?: ResourceValues;
  /** (current - recommended) x replicas: positive when reclaimable, negative for an increase, absent when a request is missing. */
  cpuSavingCores?: number;
  memorySavingGiB?: number;
}

export interface TopGainsReport {
  limit: number;
  byCPU: ContainerGain[];
  byMemory: ContainerGain[];
  tailorings: SavingsCounts;
}

function finiteNumber(value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function count(value: unknown): number {
  return Math.max(0, Math.round(finiteNumber(value)));
}

function nonNegative(value: unknown): number | undefined {
  const n = optionalNumber(value);
  return n !== undefined && n >= 0 ? n : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function setIfDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined) {
  if (value !== undefined) target[key] = value;
}

function normalizeAmounts(raw: unknown): SavingsAmounts {
  const r = asRecord(raw);
  const cpu = asRecord(r.cpu);
  const memory = asRecord(r.memory);
  const amounts: SavingsAmounts = {
    cpu: {
      reclaimableCores: finiteNumber(cpu.reclaimableCores),
      increaseCores: finiteNumber(cpu.increaseCores),
      netCores: finiteNumber(cpu.netCores),
    },
    memory: {
      reclaimableGiB: finiteNumber(memory.reclaimableGiB),
      increaseGiB: finiteNumber(memory.increaseGiB),
      netGiB: finiteNumber(memory.netGiB),
    },
  };
  setIfDefined(amounts.cpu, 'totalRequestedCores', nonNegative(cpu.totalRequestedCores));
  setIfDefined(amounts.cpu, 'netPercent', optionalNumber(cpu.netPercent));
  setIfDefined(amounts.memory, 'totalRequestedGiB', nonNegative(memory.totalRequestedGiB));
  setIfDefined(amounts.memory, 'netPercent', optionalNumber(memory.netPercent));
  if (r.cost && typeof r.cost === 'object') {
    const cost = asRecord(r.cost);
    amounts.cost = {
      reclaimablePerHour: finiteNumber(cost.reclaimablePerHour),
      increasePerHour: finiteNumber(cost.increasePerHour),
      netPerHour: finiteNumber(cost.netPerHour),
    };
  }
  return amounts;
}

function normalizeGroup(raw: unknown): SavingsGroup {
  const r = asRecord(raw);
  const group: SavingsGroup = {
    cluster: nonEmptyString(r.cluster) ?? '',
    tailorings: count(r.tailorings),
    ...normalizeAmounts(raw),
  };
  if (r.namespace !== undefined) group.namespace = nonEmptyString(r.namespace) ?? '';
  return group;
}

function normalizeCounts(raw: unknown): SavingsCounts {
  const r = asRecord(raw);
  return {
    total: count(r.total),
    included: count(r.included),
    skippedNoAnalysis: count(r.skippedNoAnalysis),
    skippedNoReplicas: count(r.skippedNoReplicas),
    skippedNoCurrentRequest: count(r.skippedNoCurrentRequest),
  };
}

/** Coerces a savings response into SavingsReport, tolerating missing or malformed fields. */
export function normalizeSavings(raw: unknown): SavingsReport {
  const r = asRecord(raw);
  const report: SavingsReport = {
    totals: normalizeAmounts(r.totals),
    byCluster: asList(r.byCluster).map(normalizeGroup),
    byNamespace: asList(r.byNamespace).map(normalizeGroup),
    tailorings: normalizeCounts(r.tailorings),
  };
  if (r.pricing && typeof r.pricing === 'object') {
    const pricing = asRecord(r.pricing);
    report.pricing = {
      cpuPricePerCoreHour: optionalNumber(pricing.cpuPricePerCoreHour),
      memPricePerGiBHour: optionalNumber(pricing.memPricePerGiBHour),
    };
  }
  return report;
}

function normalizeResourceValues(raw: unknown): ResourceValues | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = asRecord(raw);
  return { cpu: nonEmptyString(r.cpu), memory: nonEmptyString(r.memory) };
}

function normalizeGain(raw: unknown): ContainerGain {
  const g = asRecord(raw);
  return {
    cluster: nonEmptyString(g.cluster) ?? '',
    namespace: nonEmptyString(g.namespace) ?? '',
    tailoring: nonEmptyString(g.tailoring) ?? '',
    workloadKind: nonEmptyString(g.workloadKind) ?? '',
    workloadName: nonEmptyString(g.workloadName) ?? '',
    workloadNamespace: nonEmptyString(g.workloadNamespace) ?? '',
    container: nonEmptyString(g.container) ?? '',
    replicas: count(g.replicas),
    currentRequests: normalizeResourceValues(g.currentRequests),
    recommendedRequests: normalizeResourceValues(g.recommendedRequests),
    cpuSavingCores: optionalNumber(g.cpuSavingCores),
    memorySavingGiB: optionalNumber(g.memorySavingGiB),
  };
}

/** Coerces a top-gains response into TopGainsReport, tolerating missing or malformed fields. */
export function normalizeTopGains(raw: unknown): TopGainsReport {
  const r = asRecord(raw);
  return {
    limit: count(r.limit),
    byCPU: asList(r.byCPU).map(normalizeGain),
    byMemory: asList(r.byMemory).map(normalizeGain),
    tailorings: normalizeCounts(r.tailorings),
  };
}

export function savingsParams(pricing?: SavingsPricing): Record<string, string> {
  const params: Record<string, string> = {};
  const set = (name: keyof SavingsPricing) => {
    const value = pricing?.[name];
    if (value !== undefined && Number.isFinite(value) && value >= 0) params[name] = String(value);
  };
  set('cpuPricePerCoreHour');
  set('memPricePerGiBHour');
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
  getSavingsSummary: async (pricing?: SavingsPricing): Promise<SavingsReport> =>
    normalizeSavings(await getAnalytics<unknown>(ANALYTICS_PATHS.savings, 'Savings', savingsParams(pricing))),

  // The server accepts a limit from 1 to MAX_TOP_GAINS_LIMIT.
  getTopGains: async (limit = 10): Promise<TopGainsReport> => {
    const n = Number.isFinite(limit) ? Math.min(MAX_TOP_GAINS_LIMIT, Math.max(1, Math.floor(limit))) : 10;
    const params = { limit: String(n) };
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
