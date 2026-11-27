import { describe, expect, test } from 'bun:test';
import {
  autoscalerOverview,
  concurrencyLimiter,
  conflictText,
  formatPeakToBaseline,
  formatReplicaBounds,
  normalizeAutoscalers,
  normalizeConditions,
  normalizeScaling,
  parseAutoscalerRef,
  replicaSourceLabel,
  scalingConflicts,
  scalingPointShift,
  shortKind,
  sizingLabel,
} from './scaling';

// Shape of status.scaling as written by the server.
const scaling = {
  autoscalers: ['HorizontalPodAutoscaler/example-app', 'VerticalPodAutoscaler/example-app'],
  replicas: { min: 2, typical: 4, max: 8, source: 'History' },
  alignedResources: ['cpu'],
  containers: [
    {
      name: 'app',
      cpu: { sizing: 'HPAUtilization', perPodRequest: '300m', request: '584m', targetUtilization: 60, perPodUsage: '350m', peakToBaseline: '1.12', reason: 'cpu reason' },
      memory: { sizing: 'VPABaseline', perPodRequest: '400Mi', request: '240Mi', peakToBaseline: '3.50', spiky: true, reason: 'memory reason' },
    },
  ],
  vpa: [
    { name: 'example-app', updateMode: 'Auto', writeBack: true, containers: [{ name: 'app', minAllowed: { memory: '240Mi' }, maxAllowed: { memory: '1080Mi' } }], reason: 'vpa reason' },
  ],
  reason: 'Requests for cpu sized for the Utilization target.',
};

describe('normalizeScaling', () => {
  test('keeps every field of a full summary', () => {
    const s = normalizeScaling(scaling)!;
    expect(s.autoscalers).toEqual(scaling.autoscalers);
    expect(s.replicas).toEqual({ min: 2, typical: 4, max: 8, source: 'History' });
    expect(s.alignedResources).toEqual(['cpu']);
    expect(s.containers[0].cpu).toEqual({ ...scaling.containers[0].cpu, spiky: false });
    expect(s.containers[0].memory).toMatchObject({ sizing: 'VPABaseline', spiky: true, peakToBaseline: '3.50', targetUtilization: undefined });
    expect(s.vpa[0]).toEqual({
      name: 'example-app',
      updateMode: 'Auto',
      writeBack: true,
      containers: [{ name: 'app', minAllowed: { memory: '240Mi', cpu: undefined }, maxAllowed: { memory: '1080Mi', cpu: undefined }, currentMinAllowed: undefined, currentMaxAllowed: undefined }],
      reason: 'vpa reason',
    });
    expect(s.conflicts).toEqual([]);
    expect(s.reason).toBe(scaling.reason);
  });

  test.each([[undefined], [null], ['x'], [42], [[]]])('is undefined for %p (older server)', (raw) => {
    expect(normalizeScaling(raw)).toBeUndefined();
  });

  test('turns an empty object into empty lists', () => {
    expect(normalizeScaling({})).toEqual({ autoscalers: [], replicas: undefined, alignedResources: [], containers: [], vpa: [], conflicts: [], reason: undefined });
  });

  test('drops garbage instead of passing objects or NaN through', () => {
    const s = normalizeScaling({
      autoscalers: 'HorizontalPodAutoscaler/x',
      replicas: { min: 'NaN', typical: Infinity, max: -1, source: { a: 1 } },
      alignedResources: [{ r: 'cpu' }, 'memory', null],
      containers: [null, 'app', { name: { n: 1 }, cpu: 'fast', memory: { sizing: 7, request: { v: 1 }, targetUtilization: 'sixty', peakToBaseline: ['x'], spiky: 'yes' } }],
      vpa: [{ writeBack: 'true', containers: 'all' }],
      conflicts: [{ autoscalers: 'x', message: { m: 1 } }],
      reason: { text: 'x' },
    })!;
    expect(s.autoscalers).toEqual([]);
    expect(s.replicas).toBeUndefined();
    expect(s.alignedResources).toEqual(['memory']);
    expect(s.containers).toEqual([
      { name: '', cpu: undefined, memory: { sizing: '7', perPodRequest: undefined, request: undefined, targetUtilization: undefined, perPodUsage: undefined, peakToBaseline: undefined, spiky: false, reason: undefined } },
    ]);
    expect(s.vpa).toEqual([{ name: undefined, updateMode: undefined, writeBack: false, containers: [], reason: undefined }]);
    expect(s.conflicts).toEqual([{ resource: undefined, autoscalers: [], message: undefined }]);
    expect(s.reason).toBeUndefined();
  });

  test('keeps a partial replica range', () => {
    expect(normalizeScaling({ replicas: { typical: 3 } })!.replicas).toEqual({ min: undefined, typical: 3, max: undefined, source: undefined });
  });
});

describe('normalizeAutoscalers', () => {
  test('reads the new fields and tolerates their absence', () => {
    const [hpa, old] = normalizeAutoscalers([
      {
        kind: 'HorizontalPodAutoscaler',
        name: 'example-app',
        minReplicas: 2,
        maxReplicas: 8,
        utilizationTargets: [{ resource: 'cpu', averageUtilization: 60 }, { resource: 'memory', container: 'app', averageUtilization: 80 }, 'x'],
        otherMetrics: ['External'],
      },
      { kind: 'HorizontalPodAutoscaler', name: 'example-old', utilizationResources: ['cpu'] },
    ]);
    expect(hpa).toMatchObject({ minReplicas: 2, maxReplicas: 8, otherMetrics: ['External'] });
    expect(hpa.utilizationTargets).toEqual([
      { resource: 'cpu', container: undefined, averageUtilization: 60 },
      { resource: 'memory', container: 'app', averageUtilization: 80 },
    ]);
    expect(old).toMatchObject({ minReplicas: undefined, maxReplicas: undefined, utilizationTargets: [], otherMetrics: [], utilizationResources: ['cpu'] });
  });

  test('drops non-objects and invalid replica counts', () => {
    expect(normalizeAutoscalers('x')).toEqual([]);
    const [a] = normalizeAutoscalers([null, { kind: 'VerticalPodAutoscaler', minReplicas: -2, maxReplicas: 'many' }]);
    expect(a.minReplicas).toBeUndefined();
    expect(a.maxReplicas).toBeUndefined();
  });
});

describe('labels', () => {
  test.each([
    ['PerPod', 'Per pod'],
    ['HPAUtilization', 'HPA utilization'],
    ['VPABaseline', 'VPA baseline'],
    ['SomethingNew', 'SomethingNew'],
    ['toString', 'toString'],
    [undefined, '—'],
  ])('sizingLabel(%p) = %p', (sizing, label) => {
    expect(sizingLabel(sizing)).toBe(label);
  });

  test('replica sources and kinds fall back to the raw value', () => {
    expect(replicaSourceLabel('History')).toBe('replica history');
    expect(replicaSourceLabel('Fixed')).toBe('fixed (minReplicas = maxReplicas)');
    expect(replicaSourceLabel('Guess')).toBe('Guess');
    expect(replicaSourceLabel(undefined)).toBeUndefined();
    expect(shortKind('ScaledObject')).toBe('KEDA');
    expect(shortKind('HorizontalPodAutoscaler')).toBe('HPA');
    expect(shortKind('CustomScaler')).toBe('CustomScaler');
    expect(shortKind('constructor')).toBe('constructor');
  });

  test('parseAutoscalerRef splits at the first slash', () => {
    expect(parseAutoscalerRef('ScaledObject/example-app')).toEqual({ kind: 'ScaledObject', name: 'example-app' });
    expect(parseAutoscalerRef('VerticalPodAutoscaler')).toEqual({ kind: 'VerticalPodAutoscaler', name: '' });
    expect(parseAutoscalerRef('a/b/c')).toEqual({ kind: 'a', name: 'b/c' });
  });

  test('formatters', () => {
    expect(formatPeakToBaseline('3.20')).toBe('3.20×');
    expect(formatPeakToBaseline('huge')).toBe('huge');
    expect(formatPeakToBaseline(undefined)).toBe('—');
    expect(formatReplicaBounds(2, 8)).toBe('2–8');
    expect(formatReplicaBounds(3, 3)).toBe('3');
    expect(formatReplicaBounds(2, undefined)).toBe('min 2');
    expect(formatReplicaBounds(undefined, 8)).toBe('max 8');
    expect(formatReplicaBounds(undefined, undefined)).toBeUndefined();
  });
});

describe('conflicts and conditions', () => {
  const conflictCondition = (status: string, message?: string) => normalizeConditions([{ type: 'AutoscalerConflict', status, reason: 'AutoscalersConflict', message }]);

  test('prefers status.scaling.conflicts over the condition', () => {
    const s = normalizeScaling({
      conflicts: [
        { resource: 'cpu', autoscalers: ['HorizontalPodAutoscaler/a', 'VerticalPodAutoscaler/a'], message: 'first' },
        { autoscalers: ['HorizontalPodAutoscaler/a', 'HorizontalPodAutoscaler/b'], message: 'second' },
      ],
    });
    expect(scalingConflicts(s, conflictCondition('True', 'first; second')).map(conflictText)).toEqual(['first', 'second']);
  });

  test('falls back to a true AutoscalerConflict condition', () => {
    expect(scalingConflicts(undefined, conflictCondition('True', 'joined message'))).toEqual([{ autoscalers: [], message: 'joined message' }]);
    expect(scalingConflicts(undefined, conflictCondition('True'))[0].message).toBe('AutoscalersConflict');
    expect(scalingConflicts(undefined, conflictCondition('False', 'none'))).toEqual([]);
    expect(scalingConflicts(undefined, [])).toEqual([]);
  });

  test('conflictText describes a conflict without a message', () => {
    expect(conflictText({ resource: 'cpu', autoscalers: ['HorizontalPodAutoscaler/a', 'VerticalPodAutoscaler/a'] })).toBe(
      'HorizontalPodAutoscaler/a, VerticalPodAutoscaler/a conflict on cpu',
    );
    expect(conflictText({ autoscalers: [] })).toBe('Autoscaler conflict');
  });

  test('scalingPointShift reads a true ScalingPointShifted condition', () => {
    expect(scalingPointShift(normalizeConditions([{ type: 'ScalingPointShifted', status: 'True', message: 'shifted' }]))).toBe('shifted');
    expect(scalingPointShift(normalizeConditions([{ type: 'ScalingPointShifted', status: 'False', message: 'kept' }]))).toBeUndefined();
  });

  test('normalizeConditions drops entries without a type', () => {
    expect(normalizeConditions([{ status: 'True' }, 'x', null, { type: 'Ready', status: 'True' }])).toEqual([
      { type: 'Ready', status: 'True', reason: undefined, message: undefined },
    ]);
    expect(normalizeConditions(undefined)).toEqual([]);
  });
});

describe('autoscalerOverview', () => {
  test('counts an HPA owned by a ScaledObject as KEDA, in HPA, KEDA, VPA order', () => {
    const o = autoscalerOverview({
      autoscalers: [
        { kind: 'VerticalPodAutoscaler', name: 'example-app', updateMode: 'Off' },
        { kind: 'HorizontalPodAutoscaler', name: 'keda-hpa-example-app', managedBy: 'example-app' },
        { kind: 'ScaledObject', name: 'example-app' },
      ],
    });
    expect(o.kinds).toEqual(['KEDA', 'VPA']);
    expect(o.names).toEqual(['VerticalPodAutoscaler/example-app', 'HorizontalPodAutoscaler/keda-hpa-example-app', 'ScaledObject/example-app']);
    expect(o.conflicts).toEqual([]);
  });

  test('falls back to status.scaling.autoscalers, then to vpaDetected', () => {
    expect(autoscalerOverview({ scaling }).kinds).toEqual(['HPA', 'VPA']);
    expect(autoscalerOverview({ vpaDetected: true }).kinds).toEqual(['VPA']);
    expect(autoscalerOverview({ scaling: { autoscalers: ['CustomScaler/x', 'HorizontalPodAutoscaler/y'] } }).kinds).toEqual(['HPA', 'CustomScaler']);
  });

  test('is empty without autoscalers or status', () => {
    expect(autoscalerOverview(undefined)).toEqual({ kinds: [], names: [], conflicts: [] });
    expect(autoscalerOverview({ scaling: { autoscalers: [], reason: 'none' } })).toEqual({ kinds: [], names: [], conflicts: [] });
    expect(autoscalerOverview({ autoscalers: 'x' as never, scaling: 'y' as never })).toEqual({ kinds: [], names: [], conflicts: [] });
  });

  test('reports conflicts from status.scaling and from the condition', () => {
    const conflicts = [
      { resource: 'cpu', autoscalers: ['HorizontalPodAutoscaler/a', 'VerticalPodAutoscaler/a'], message: 'first' },
      { autoscalers: ['VerticalPodAutoscaler/a', 'VerticalPodAutoscaler/b'], message: 'second' },
    ];
    expect(autoscalerOverview({ scaling: { ...scaling, conflicts } }).conflicts).toEqual(['first', 'second']);
    expect(
      autoscalerOverview({ conditions: [{ type: 'AutoscalerConflict', status: 'True', reason: 'AutoscalersConflict', message: 'from condition' }] }).conflicts,
    ).toEqual(['from condition']);
  });
});

describe('concurrencyLimiter', () => {
  test('runs at most the limit at a time, in order, and passes results and errors through', async () => {
    const run = concurrencyLimiter(2);
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    const task = (i: number) => async () => {
      started.push(i);
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      if (i === 3) throw new Error('boom');
      return i;
    };
    const results = await Promise.allSettled([0, 1, 2, 3, 4].map((i) => run(task(i))));
    expect(peak).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4]);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : (r.reason as Error).message))).toEqual([0, 1, 2, 'boom', 4]);
  });

  test('keeps going after a task throws synchronously', async () => {
    const run = concurrencyLimiter(1);
    const failing = run((() => {
      throw new Error('sync');
    }) as () => Promise<never>);
    await expect(failing).rejects.toThrow('sync');
    expect(await run(async () => 'next')).toBe('next');
  });
});
