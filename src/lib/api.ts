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
  // The fields below are absent on servers that predate them.
  /** Status of the Analyzed condition: "True", "False" or "Unknown". */
  analyzedCondition?: string;
  analyzedReason?: string;
  analyzedMessage?: string;
  nextAnalysisTime?: string;
  consecutiveFailures?: number;
}

export type AnalysisState = 'analyzed' | 'failing' | 'pending';

export interface AnalysisStatus {
  state: AnalysisState;
  reason?: string;
  message?: string;
  lastAnalysis?: Date;
  nextAnalysis?: Date;
  consecutiveFailures: number;
}

function parseTime(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function trimmed(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Derives the analysis state of a Tailoring from its summary. A Tailoring is
 * failing when its Analyzed condition is False, or, without a condition, when
 * failures are counted; analyzed when the condition is True or it has a last
 * analysis; otherwise it is still pending its first analysis.
 */
export function tailoringAnalysisStatus(summary: TailoringSummary): AnalysisStatus {
  const condition = trimmed(summary.analyzedCondition);
  const failures = Number(summary.consecutiveFailures);
  const consecutiveFailures = Number.isFinite(failures) && failures > 0 ? Math.floor(failures) : 0;
  const lastAnalysis = parseTime(summary.lastAnalysis);
  let state: AnalysisState;
  if (condition === 'False' || (!condition && consecutiveFailures > 0)) {
    state = 'failing';
  } else if (condition === 'True' || lastAnalysis) {
    state = 'analyzed';
  } else {
    state = 'pending';
  }
  return {
    state,
    reason: trimmed(summary.analyzedReason),
    message: trimmed(summary.analyzedMessage),
    lastAnalysis,
    nextAnalysis: parseTime(summary.nextAnalysisTime),
    consecutiveFailures,
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
  return requestError(err, 'Forecast', () => new ForecastUnavailableError());
}

function requestError(err: unknown, label: string, unavailable: () => Error): Error {
  if (axios.isAxiosError(err)) {
    const body: unknown = err.response?.data;
    const serverMessage =
      body && typeof body === 'object' && typeof (body as ApiResponse<unknown>).error === 'string'
        ? (body as ApiResponse<unknown>).error?.trim()
        : undefined;
    if (serverMessage) return new Error(serverMessage);
    if (err.response?.status === 404) return unavailable();
    if (err.response) return new Error(`${label} request failed with status ${err.response.status}`);
    return new Error(err.message || `${label} request failed`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** The server predates an endpoint the UI calls. */
export class EndpointUnavailableError extends Error {
  constructor(message = 'This requires a newer Sartor server version.') {
    super(message);
    this.name = 'EndpointUnavailableError';
  }
}

export const ANALYTICS_ENDPOINTS = {
  savings: '/api/v1/analytics/savings',
  topGains: '/api/v1/analytics/top-gains',
} as const;

export const DEFAULT_TOP_GAINS_LIMIT = 10;

/**
 * Request changes the latest recommendations would make, as
 * (current - recommended request) x replicas: reclaimable sums the decreases,
 * needed the increases.
 */
export interface ResourceSavings {
  reclaimableCpuCores: number;
  neededCpuCores: number;
  reclaimableMemoryGiB: number;
  neededMemoryGiB: number;
  /** Set only when the server was given prices. */
  reclaimableCost?: number;
  neededCost?: number;
}

export interface SavingsCounts {
  /** Containers counted in the totals. */
  included: number;
  /** Containers left out, for example because they have no recommendation yet. */
  skipped: number;
}

export interface NamespaceSavings extends ResourceSavings, SavingsCounts {
  namespace: string;
}

export interface ClusterSavings extends ResourceSavings, SavingsCounts {
  /** Empty when the server does not tell clusters apart. */
  cluster: string;
  namespaces: NamespaceSavings[];
}

export interface SavingsReport {
  clusters: ClusterSavings[];
  total: ResourceSavings & SavingsCounts;
  currency?: string;
}

export interface TopGain {
  cluster: string;
  namespace: string;
  /** Name of the Tailoring; empty when the server did not send one. */
  tailoring: string;
  container: string;
  targetKind?: string;
  targetName?: string;
  replicas?: number;
  reclaimableCpuCores: number;
  reclaimableMemoryGiB: number;
  /** Per-replica requests. */
  currentCpuCores?: number;
  recommendedCpuCores?: number;
  currentMemoryGiB?: number;
  recommendedMemoryGiB?: number;
}

/** Containers with a positive reclaimable amount, largest first. */
export interface TopGains {
  cpu: TopGain[];
  memory: TopGain[];
}

type RawObject = Record<string, unknown>;

function isObject(value: unknown): value is RawObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Field names are matched case-insensitively so that, e.g., reclaimableCpuCores
// and reclaimableCPUCores are both understood.
function rawField(raw: RawObject, names: string[]): unknown {
  for (const name of names) {
    if (name in raw) return raw[name];
  }
  const lower = names.map((name) => name.toLowerCase());
  const key = Object.keys(raw).find((k) => lower.includes(k.toLowerCase()));
  return key === undefined ? undefined : raw[key];
}

function optionalNumber(raw: RawObject, ...names: string[]): number | undefined {
  const value = rawField(raw, names);
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function rawString(raw: RawObject, ...names: string[]): string {
  const value = rawField(raw, names);
  return typeof value === 'string' ? value.trim() : '';
}

function rawArray(raw: RawObject, ...names: string[]): unknown[] {
  const value = rawField(raw, names);
  return Array.isArray(value) ? value : [];
}

const SAVINGS_FIELDS = {
  reclaimableCpuCores: ['reclaimableCpuCores', 'reclaimableCpu'],
  neededCpuCores: ['neededCpuCores', 'neededCpu'],
  reclaimableMemoryGiB: ['reclaimableMemoryGiB', 'reclaimableMemory'],
  neededMemoryGiB: ['neededMemoryGiB', 'neededMemory'],
} as const;

const COUNT_FIELDS = {
  included: ['included', 'includedCount'],
  skipped: ['skipped', 'skippedCount'],
} as const;

type SavingsTotals = ResourceSavings & SavingsCounts;

function sumSavings(items: SavingsTotals[]): SavingsTotals {
  const total: SavingsTotals = {
    reclaimableCpuCores: 0,
    neededCpuCores: 0,
    reclaimableMemoryGiB: 0,
    neededMemoryGiB: 0,
    included: 0,
    skipped: 0,
  };
  for (const item of items) {
    for (const key of [...Object.keys(SAVINGS_FIELDS), ...Object.keys(COUNT_FIELDS)] as Array<keyof SavingsTotals>) {
      total[key] = (total[key] ?? 0) + (item[key] ?? 0);
    }
    for (const key of ['reclaimableCost', 'neededCost'] as const) {
      if (item[key] !== undefined) total[key] = (total[key] ?? 0) + item[key];
    }
  }
  return total;
}

/** Reads totals from raw, using fallback for the fields it lacks. */
function savingsTotals(raw: RawObject, fallback: SavingsTotals): SavingsTotals {
  const totals = { ...fallback };
  for (const [key, names] of Object.entries({ ...SAVINGS_FIELDS, ...COUNT_FIELDS })) {
    const value = optionalNumber(raw, ...names);
    if (value !== undefined) totals[key as keyof typeof SAVINGS_FIELDS | keyof typeof COUNT_FIELDS] = value;
  }
  const reclaimableCost = optionalNumber(raw, 'reclaimableCost');
  const neededCost = optionalNumber(raw, 'neededCost');
  if (reclaimableCost !== undefined) totals.reclaimableCost = reclaimableCost;
  if (neededCost !== undefined) totals.neededCost = neededCost;
  return totals;
}

const ZERO_TOTALS = sumSavings([]);

/** Converts the savings endpoint's data into a SavingsReport; anything unusable becomes empty. */
export function normalizeSavingsReport(data: unknown): SavingsReport {
  const raw: RawObject = Array.isArray(data) ? { clusters: data } : isObject(data) ? data : {};
  const clusters: ClusterSavings[] = rawArray(raw, 'clusters')
    .filter(isObject)
    .map((rawCluster) => {
      const namespaces: NamespaceSavings[] = rawArray(rawCluster, 'namespaces')
        .filter(isObject)
        .map((rawNamespace) => ({
          namespace: rawString(rawNamespace, 'namespace', 'name'),
          ...savingsTotals(rawNamespace, ZERO_TOTALS),
        }));
      return {
        cluster: rawString(rawCluster, 'cluster', 'name'),
        ...savingsTotals(rawCluster, sumSavings(namespaces)),
        namespaces,
      };
    });
  const rawTotal = rawField(raw, ['total', 'totals']);
  const total = savingsTotals(raw, savingsTotals(isObject(rawTotal) ? rawTotal : {}, sumSavings(clusters)));
  const currency = rawString(raw, 'currency');
  return { clusters, total, ...(currency ? { currency } : {}) };
}

function normalizeTopGain(raw: RawObject): TopGain {
  const gain: TopGain = {
    cluster: rawString(raw, 'cluster'),
    namespace: rawString(raw, 'namespace'),
    tailoring: rawString(raw, 'tailoring', 'tailoringName', 'name'),
    container: rawString(raw, 'container', 'containerName'),
    reclaimableCpuCores: optionalNumber(raw, ...SAVINGS_FIELDS.reclaimableCpuCores) ?? 0,
    reclaimableMemoryGiB: optionalNumber(raw, ...SAVINGS_FIELDS.reclaimableMemoryGiB) ?? 0,
  };
  const targetKind = rawString(raw, 'targetKind');
  const targetName = rawString(raw, 'targetName');
  if (targetKind) gain.targetKind = targetKind;
  if (targetName) gain.targetName = targetName;
  const optional = {
    replicas: optionalNumber(raw, 'replicas'),
    currentCpuCores: optionalNumber(raw, 'currentCpuCores', 'currentCpu'),
    recommendedCpuCores: optionalNumber(raw, 'recommendedCpuCores', 'recommendedCpu'),
    currentMemoryGiB: optionalNumber(raw, 'currentMemoryGiB', 'currentMemory'),
    recommendedMemoryGiB: optionalNumber(raw, 'recommendedMemoryGiB', 'recommendedMemory'),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) gain[key as keyof typeof optional] = value;
  }
  return gain;
}

function rankGains(items: unknown[], key: 'reclaimableCpuCores' | 'reclaimableMemoryGiB', limit: number): TopGain[] {
  return items
    .filter(isObject)
    .map(normalizeTopGain)
    .filter((gain) => gain[key] > 0)
    .sort((a, b) => b[key] - a[key])
    .slice(0, Math.max(0, limit));
}

/**
 * Converts the top-gains endpoint's data into separate CPU and memory
 * rankings. The data may be one list of containers, or an object with a list
 * per resource.
 */
export function normalizeTopGains(data: unknown, limit = DEFAULT_TOP_GAINS_LIMIT): TopGains {
  if (Array.isArray(data)) {
    return { cpu: rankGains(data, 'reclaimableCpuCores', limit), memory: rankGains(data, 'reclaimableMemoryGiB', limit) };
  }
  if (!isObject(data)) return { cpu: [], memory: [] };
  const shared = rawArray(data, 'items', 'containers', 'gains');
  const cpu = rawArray(data, 'cpu', 'byCpu');
  const memory = rawArray(data, 'memory', 'byMemory');
  return {
    cpu: rankGains(cpu.length > 0 ? cpu : shared, 'reclaimableCpuCores', limit),
    memory: rankGains(memory.length > 0 ? memory : shared, 'reclaimableMemoryGiB', limit),
  };
}

/**
 * GETs an endpoint that answers with an ApiResponse and returns its data.
 * Errors carry the server's message; a 404 without one means the server
 * predates the endpoint and becomes an EndpointUnavailableError.
 */
async function getOptionalEndpoint(
  path: string,
  params: Record<string, string>,
  label: string,
  unavailableMessage: string,
): Promise<unknown> {
  let body: unknown;
  try {
    body = (await api.get<unknown>(path, { params })).data;
  } catch (err) {
    throw requestError(err, label, () => new EndpointUnavailableError(unavailableMessage));
  }
  if (!isObject(body)) throw new Error(`${label}: the server returned an unexpected response`);
  if (body.success === false) {
    throw new Error((typeof body.error === 'string' && body.error.trim()) || `${label} request failed`);
  }
  return body.data;
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

  // Analytics computed by Sartor from its recommendations; they do not need OpenCost.
  getSavingsReport: async (): Promise<SavingsReport> => {
    const data = await getOptionalEndpoint(
      ANALYTICS_ENDPOINTS.savings,
      {},
      'Savings',
      'The savings summary requires a newer Sartor server version.',
    );
    return normalizeSavingsReport(data);
  },

  getTopGains: async (limit: number = DEFAULT_TOP_GAINS_LIMIT): Promise<TopGains> => {
    const data = await getOptionalEndpoint(
      ANALYTICS_ENDPOINTS.topGains,
      { limit: String(limit) },
      'Top gains',
      'Biggest gains requires a newer Sartor server version.',
    );
    return normalizeTopGains(data, limit);
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
