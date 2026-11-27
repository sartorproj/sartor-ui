import { asList, asRecord, quantityString, type Tailoring } from './api';

export const CONDITION_AUTOSCALER_CONFLICT = 'AutoscalerConflict';
export const CONDITION_SCALING_POINT_SHIFTED = 'ScalingPointShifted';

export interface UtilizationTargetView {
  resource: string;
  container?: string;
  averageUtilization?: number;
}

export interface DetectedAutoscalerView {
  kind: string;
  name?: string;
  updateMode?: string;
  utilizationResources: string[];
  managedBy?: string;
  minReplicas?: number;
  maxReplicas?: number;
  utilizationTargets: UtilizationTargetView[];
  otherMetrics: string[];
}

export interface ReplicaRangeView {
  min?: number;
  typical?: number;
  max?: number;
  source?: string;
}

export interface ResourceScalingView {
  sizing?: string;
  perPodRequest?: string;
  request?: string;
  targetUtilization?: number;
  perPodUsage?: string;
  peakToBaseline?: string;
  spiky: boolean;
  reason?: string;
}

export interface ContainerScalingView {
  name: string;
  cpu?: ResourceScalingView;
  memory?: ResourceScalingView;
}

export interface ResourceValuesView {
  cpu?: string;
  memory?: string;
}

export interface VPAContainerBoundsView {
  name: string;
  minAllowed?: ResourceValuesView;
  maxAllowed?: ResourceValuesView;
  currentMinAllowed?: ResourceValuesView;
  currentMaxAllowed?: ResourceValuesView;
}

export interface VPARecommendationView {
  name?: string;
  updateMode?: string;
  writeBack: boolean;
  containers: VPAContainerBoundsView[];
  reason?: string;
}

export interface ScalingConflictView {
  resource?: string;
  autoscalers: string[];
  message?: string;
}

export interface ScalingSummaryView {
  autoscalers: string[];
  replicas?: ReplicaRangeView;
  alignedResources: string[];
  containers: ContainerScalingView[];
  vpa: VPARecommendationView[];
  conflicts: ScalingConflictView[];
  reason?: string;
}

export interface ConditionView {
  type: string;
  status?: string;
  reason?: string;
  message?: string;
}

/** Strings, numbers and booleans as trimmed text; objects and empty values are dropped. */
function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean') return String(value);
  return undefined;
}

function texts(value: unknown): string[] {
  return asList(value)
    .map(text)
    .filter((s): s is string => s !== undefined);
}

function integer(value: unknown, min = -Infinity): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  return rounded >= min ? rounded : undefined;
}

function isObject(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function objects(value: unknown): Record<string, unknown>[] {
  return asList(value).filter(isObject).map(asRecord);
}

function resourceValues(value: unknown): ResourceValuesView | undefined {
  if (!isObject(value)) return undefined;
  const r = asRecord(value);
  const out = { cpu: quantityString(r.cpu), memory: quantityString(r.memory) };
  return out.cpu || out.memory ? out : undefined;
}

export function normalizeAutoscalers(raw: unknown): DetectedAutoscalerView[] {
  return objects(raw).map((a) => ({
    kind: text(a.kind) ?? '',
    name: text(a.name),
    updateMode: text(a.updateMode),
    utilizationResources: texts(a.utilizationResources),
    managedBy: text(a.managedBy),
    minReplicas: integer(a.minReplicas, 0),
    maxReplicas: integer(a.maxReplicas, 0),
    utilizationTargets: objects(a.utilizationTargets)
      .map((t) => ({
        resource: text(t.resource) ?? '',
        container: text(t.container),
        averageUtilization: integer(t.averageUtilization),
      }))
      .filter((t) => t.resource || t.averageUtilization !== undefined),
    otherMetrics: texts(a.otherMetrics),
  }));
}

function normalizeResourceScaling(raw: unknown): ResourceScalingView | undefined {
  if (!isObject(raw)) return undefined;
  const r = asRecord(raw);
  return {
    sizing: text(r.sizing),
    perPodRequest: quantityString(r.perPodRequest),
    request: quantityString(r.request),
    targetUtilization: integer(r.targetUtilization),
    perPodUsage: quantityString(r.perPodUsage),
    peakToBaseline: text(r.peakToBaseline),
    spiky: r.spiky === true,
    reason: text(r.reason),
  };
}

function normalizeReplicas(raw: unknown): ReplicaRangeView | undefined {
  if (!isObject(raw)) return undefined;
  const r = asRecord(raw);
  const range = { min: integer(r.min, 0), typical: integer(r.typical, 0), max: integer(r.max, 0), source: text(r.source) };
  return Object.values(range).some((v) => v !== undefined) ? range : undefined;
}

/** status.scaling as a view; undefined when the server did not report it. */
export function normalizeScaling(raw: unknown): ScalingSummaryView | undefined {
  if (!isObject(raw)) return undefined;
  const r = asRecord(raw);
  return {
    autoscalers: texts(r.autoscalers),
    replicas: normalizeReplicas(r.replicas),
    alignedResources: texts(r.alignedResources),
    containers: objects(r.containers).map((c) => ({
      name: text(c.name) ?? '',
      cpu: normalizeResourceScaling(c.cpu),
      memory: normalizeResourceScaling(c.memory),
    })),
    vpa: objects(r.vpa).map((v) => ({
      name: text(v.name),
      updateMode: text(v.updateMode),
      writeBack: v.writeBack === true,
      containers: objects(v.containers).map((c) => ({
        name: text(c.name) ?? '',
        minAllowed: resourceValues(c.minAllowed),
        maxAllowed: resourceValues(c.maxAllowed),
        currentMinAllowed: resourceValues(c.currentMinAllowed),
        currentMaxAllowed: resourceValues(c.currentMaxAllowed),
      })),
      reason: text(v.reason),
    })),
    conflicts: objects(r.conflicts).map((c) => ({
      resource: text(c.resource),
      autoscalers: texts(c.autoscalers),
      message: text(c.message),
    })),
    reason: text(r.reason),
  };
}

export function normalizeConditions(raw: unknown): ConditionView[] {
  return objects(raw)
    .map((c) => ({ type: text(c.type) ?? '', status: text(c.status), reason: text(c.reason), message: text(c.message) }))
    .filter((c) => c.type);
}

function findCondition(conditions: ConditionView[], type: string): ConditionView | undefined {
  return conditions.find((c) => c.type === type);
}

/**
 * The autoscaler conflicts of status.scaling, or, when it lists none, the
 * message of a true AutoscalerConflict condition.
 */
export function scalingConflicts(scaling: ScalingSummaryView | undefined, conditions: ConditionView[]): ScalingConflictView[] {
  if (scaling && scaling.conflicts.length > 0) return scaling.conflicts;
  const condition = findCondition(conditions, CONDITION_AUTOSCALER_CONFLICT);
  if (condition?.status !== 'True') return [];
  return [{ autoscalers: [], message: condition.message ?? condition.reason ?? 'Autoscalers act on the same resource.' }];
}

/** The message of a true ScalingPointShifted condition. */
export function scalingPointShift(conditions: ConditionView[]): string | undefined {
  const condition = findCondition(conditions, CONDITION_SCALING_POINT_SHIFTED);
  if (condition?.status !== 'True') return undefined;
  return condition.message ?? condition.reason ?? 'The recommended requests shift the HPA scaling point.';
}

const lookup = (labels: Record<string, string>, key: string | undefined): string | undefined =>
  key !== undefined && Object.hasOwn(labels, key) ? labels[key] : undefined;

const SIZING_LABELS: Record<string, string> = {
  PerPod: 'Per pod',
  HPAUtilization: 'HPA utilization',
  VPABaseline: 'VPA baseline',
};

/** Label for a sizing mode; unknown values are returned as they are. */
export function sizingLabel(sizing: string | undefined): string {
  return lookup(SIZING_LABELS, sizing) ?? sizing ?? '—';
}

const REPLICA_SOURCE_LABELS: Record<string, string> = {
  History: 'replica history',
  Current: 'current replica count',
  Fixed: 'fixed (minReplicas = maxReplicas)',
};

export function replicaSourceLabel(source: string | undefined): string | undefined {
  return lookup(REPLICA_SOURCE_LABELS, source) ?? source;
}

export type AutoscalerShortKind = 'HPA' | 'KEDA' | 'VPA';

const SHORT_KINDS: Record<string, AutoscalerShortKind> = {
  HorizontalPodAutoscaler: 'HPA',
  ScaledObject: 'KEDA',
  VerticalPodAutoscaler: 'VPA',
};

/** HPA, KEDA or VPA for a known kind; other kinds are returned as they are. */
export function shortKind(kind: string): string {
  return lookup(SHORT_KINDS, kind) ?? kind;
}

/** Splits "Kind/name" as status.scaling names autoscalers. */
export function parseAutoscalerRef(ref: string): { kind: string; name: string } {
  const slash = ref.indexOf('/');
  return slash < 0 ? { kind: ref, name: '' } : { kind: ref.slice(0, slash), name: ref.slice(slash + 1) };
}

const KIND_ORDER = ['HPA', 'KEDA', 'VPA'];

export interface AutoscalerOverview {
  /** HPA, KEDA, VPA (in that order), then unknown kinds as reported. */
  kinds: string[];
  /** Kind/name of every autoscaler. */
  names: string[];
  /** Conflict messages. */
  conflicts: string[];
}

/**
 * Which autoscalers a workload has, for the Tailorings list. An HPA owned by a
 * ScaledObject counts as KEDA. status.autoscalers is preferred because it
 * carries managedBy; status.scaling.autoscalers is the fallback.
 */
export function autoscalerOverview(status: Partial<Tailoring['status']> | undefined): AutoscalerOverview {
  const s = asRecord(status);
  const detected = normalizeAutoscalers(s.autoscalers).filter((a) => a.kind);
  const scaling = normalizeScaling(s.scaling);
  const kinds = new Set<string>();
  const names: string[] = [];
  if (detected.length > 0) {
    for (const a of detected) {
      kinds.add(a.kind === 'HorizontalPodAutoscaler' && a.managedBy ? 'KEDA' : shortKind(a.kind));
      names.push(a.name ? `${a.kind}/${a.name}` : a.kind);
    }
  } else if (scaling) {
    for (const ref of scaling.autoscalers) {
      const { kind } = parseAutoscalerRef(ref);
      if (kind) kinds.add(shortKind(kind));
      names.push(ref);
    }
  }
  if (kinds.size === 0 && s.vpaDetected === true) kinds.add('VPA');
  const rank = (k: string) => (KIND_ORDER.includes(k) ? KIND_ORDER.indexOf(k) : KIND_ORDER.length);
  return {
    kinds: [...kinds].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)),
    names,
    conflicts: scalingConflicts(scaling, normalizeConditions(s.conditions)).map(conflictText),
  };
}

export function conflictText(conflict: ScalingConflictView): string {
  if (conflict.message) return conflict.message;
  const who = conflict.autoscalers.join(', ');
  return [who && `${who} conflict`, conflict.resource && `on ${conflict.resource}`].filter(Boolean).join(' ') || 'Autoscaler conflict';
}

/** "3.20" -> "3.20×"; values that are not decimal numbers are returned as they are. */
export function formatPeakToBaseline(value: string | undefined): string {
  if (!value) return '—';
  return /^\d+(\.\d+)?$/.test(value) ? `${value}×` : value;
}

export function formatPercentTarget(value: number | undefined): string {
  return value === undefined ? '—' : `${value}%`;
}

/** "2–8", "min 2", "max 8" or undefined. */
export function formatReplicaBounds(min: number | undefined, max: number | undefined): string | undefined {
  if (min !== undefined && max !== undefined) return min === max ? `${min}` : `${min}–${max}`;
  if (min !== undefined) return `min ${min}`;
  if (max !== undefined) return `max ${max}`;
  return undefined;
}

/**
 * Runs at most `limit` calls at a time; the rest wait in order. Used for the
 * per-row Tailoring requests of the list, which has no autoscaler fields.
 */
export function concurrencyLimiter(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= limit) return;
    const start = queue.shift();
    if (start) {
      active++;
      start();
    }
  };
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}
