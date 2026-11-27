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
