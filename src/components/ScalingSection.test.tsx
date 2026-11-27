import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Tailoring } from '@/lib/api';
import { SCALING_UNAVAILABLE_NOTE, ScalingSection } from './ScalingSection';

type Status = Partial<Tailoring['status']>;

const lastAnalysis = (...names: string[]) => ({ timestamp: '2026-01-01T00:00:00Z', containers: names.map((name) => ({ name })) });

// Shapes as written by the server into status.scaling and status.autoscalers.
const scaling = {
  autoscalers: ['HorizontalPodAutoscaler/example-app', 'VerticalPodAutoscaler/example-app'],
  replicas: { min: 2, typical: 4, max: 8, source: 'History' },
  alignedResources: ['cpu'],
  containers: [
    {
      name: 'app',
      cpu: {
        sizing: 'HPAUtilization',
        perPodRequest: '300m',
        request: '584m',
        targetUtilization: 60,
        perPodUsage: '350m',
        peakToBaseline: '1.12',
        reason: 'Sized so the 60% cpu Utilization target matches the typical per-pod usage.',
      },
      memory: {
        sizing: 'VPABaseline',
        perPodRequest: '400Mi',
        request: '240Mi',
        peakToBaseline: '3.50',
        spiky: true,
        reason: 'Spiky memory usage: request lowered to the baseline.',
      },
    },
  ],
  vpa: [
    {
      name: 'example-app',
      updateMode: 'Auto',
      writeBack: true,
      containers: [
        {
          name: 'app',
          minAllowed: { memory: '240Mi' },
          maxAllowed: { memory: '1080Mi' },
          currentMinAllowed: { cpu: '50m', memory: '128Mi' },
        },
      ],
      reason: 'minAllowed is the usage baseline and maxAllowed the observed peak with headroom.',
    },
  ],
  reason: 'Requests for cpu sized for the Utilization target of HorizontalPodAutoscaler example-app at 4 replicas (2-8).',
};

const autoscalers = [
  {
    kind: 'HorizontalPodAutoscaler',
    name: 'example-app',
    minReplicas: 2,
    maxReplicas: 8,
    utilizationTargets: [{ resource: 'cpu', averageUtilization: 60 }],
    otherMetrics: ['External'],
  },
  { kind: 'VerticalPodAutoscaler', name: 'example-app', updateMode: 'Auto' },
];

const render = (status: Status | undefined) => renderToStaticMarkup(<ScalingSection status={status as Tailoring['status']} />);

const expectClean = (html: string) => {
  expect(html).not.toContain('NaN');
  expect(html).not.toContain('undefined');
  expect(html).not.toContain('null');
  expect(html).not.toContain('[object Object]');
  expect(html).not.toContain('Infinity');
};

describe('ScalingSection', () => {
  test('shows the combined recommendation', () => {
    const html = render({ lastAnalysis: lastAnalysis('app'), scaling, autoscalers });
    expect(html).toContain('Scaling');
    expect(html).toContain(scaling.reason);
    expect(html).toMatch(/<span class="font-semibold">HPA<\/span><span class="font-mono text-xs">example-app<\/span>/);
    expect(html).toContain('2 / 4 / 8');
    expect(html).toContain('from replica history');
    expect(html).toContain('>cpu</span>');
    expect(html).toContain('HPA utilization');
    expect(html).toContain('VPA baseline');
    expect(html).toContain('300m');
    expect(html).toContain('584m');
    expect(html).toContain('60%');
    expect(html).toContain('1.12×');
    expect(html).toContain('3.50×');
    expect(html).toContain('Spiky');
    expect(html).toContain('400Mi');
    expect(html).toContain('240Mi');
    expect(html).toContain('Spiky memory usage: request lowered to the baseline.');
    expect(html).toContain('VPA bounds');
    expect(html).toContain('updateMode Auto');
    expect(html).toContain('Applied by write-back');
    expect(html).toContain('memory 1.05Gi');
    expect(html).toContain('cpu 50m · memory 128Mi');
    expect(html).toContain(scaling.vpa[0].reason);
    expect(html).toContain('Detected autoscalers');
    expect(html).toContain('2–8');
    expect(html).toContain('cpu 60%');
    expect(html).toContain('External');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('No scaling details for');
    expectClean(html);
  });

  test('renders nothing before the first analysis', () => {
    expect(render({})).toBe('');
    expect(render(undefined)).toBe('');
  });

  test('says the server is too old when an analysis has no status.scaling', () => {
    const html = render({ lastAnalysis: lastAnalysis('app') });
    expect(html).toContain(SCALING_UNAVAILABLE_NOTE);
    expect(html).not.toContain('Detected autoscalers');
    expectClean(html);
  });

  test('lists the autoscalers an older server detected, without the new fields', () => {
    const html = render({
      lastAnalysis: lastAnalysis('app'),
      autoscalers: [{ kind: 'HorizontalPodAutoscaler', name: 'example-app', utilizationResources: ['cpu'] }],
    });
    expect(html).toContain(SCALING_UNAVAILABLE_NOTE);
    expect(html).toContain('Detected autoscalers');
    expect(html).toContain('cpu (Utilization)');
    expectClean(html);
  });

  test('shows a workload without autoscalers', () => {
    const html = render({
      lastAnalysis: lastAnalysis('app'),
      scaling: {
        reason: 'No autoscaler targets the workload: requests are sized per pod from usage.',
        containers: [{ name: 'app', cpu: { sizing: 'PerPod', perPodRequest: '100m', request: '100m' } }],
      },
    });
    expect(html).toContain('No autoscaler targets the workload');
    expect(html).toContain('None detected');
    expect(html).toContain('Not reported');
    expect(html).toContain('No resource');
    expect(html).toContain('Per pod');
    expect(html).not.toContain('Detected autoscalers');
    expect(html).not.toContain('VPA bounds');
    expectClean(html);
  });

  test('lists analyzed containers that have no scaling details', () => {
    const html = render({
      lastAnalysis: lastAnalysis('app', 'sidecar', 'init-proxy'),
      scaling: { ...scaling, containers: [{ name: 'app', memory: scaling.containers[0].memory }] },
    });
    expect(html).toContain('No scaling details for: sidecar, init-proxy');
    expect(html).toContain('>VPA baseline<');
    expect(html).not.toContain('>HPA utilization<');
    expectClean(html);
  });

  test('shows dashes for a partial replica range', () => {
    const html = render({ lastAnalysis: lastAnalysis(), scaling: { ...scaling, replicas: { typical: 3, source: 'Current' } as never } });
    expect(html).toContain('— / 3 / —');
    expect(html).toContain('from current replica count');
    expectClean(html);
  });

  test('marks VPA bounds with updateMode Off as a recommendation only', () => {
    const html = render({
      lastAnalysis: lastAnalysis('app'),
      scaling: { ...scaling, vpa: [{ ...scaling.vpa[0], updateMode: 'Off', writeBack: false, reason: 'VPA bounds recommended only (updateMode Off).' }] },
    });
    expect(html).toContain('updateMode Off');
    expect(html).toContain('Recommendation only (updateMode Off)');
    expect(html).not.toContain('Applied by write-back');
    expectClean(html);
  });

  test('marks VPA bounds that write-back does not apply', () => {
    const html = render({ lastAnalysis: lastAnalysis('app'), scaling: { ...scaling, vpa: [{ name: 'example-app', updateMode: 'Auto', writeBack: false }] } });
    expect(html).toContain('Recommendation only, not written back');
    expect(html).toContain('No container bounds recommended.');
  });

  test('warns about every conflict', () => {
    const html = render({
      lastAnalysis: lastAnalysis('app'),
      scaling: {
        ...scaling,
        conflicts: [
          { resource: 'cpu', autoscalers: ['HorizontalPodAutoscaler/example-app', 'VerticalPodAutoscaler/example-app'], message: 'VPA and HPA both act on cpu' },
          { autoscalers: ['HorizontalPodAutoscaler/example-a', 'HorizontalPodAutoscaler/example-b'], message: '2 horizontal autoscalers target the workload' },
        ],
      },
      conditions: [{ type: 'AutoscalerConflict', status: 'True', reason: 'AutoscalersConflict', message: 'joined' }],
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain('2 autoscaler conflicts');
    expect(html).toContain('VPA and HPA both act on cpu');
    expect(html).toContain('2 horizontal autoscalers target the workload');
    expect(html).toContain('HorizontalPodAutoscaler/example-a + HorizontalPodAutoscaler/example-b');
    expect(html).not.toContain('joined');
    expectClean(html);
  });

  test('warns from the AutoscalerConflict condition alone', () => {
    const html = render({
      lastAnalysis: lastAnalysis('app'),
      conditions: [{ type: 'AutoscalerConflict', status: 'True', reason: 'AutoscalersConflict', message: 'VPA and HPA both act on memory' }],
    });
    expect(html).toContain('Autoscaler conflict');
    expect(html).toContain('VPA and HPA both act on memory');
  });

  test('shows a shifted HPA scaling point', () => {
    const html = render({
      lastAnalysis: lastAnalysis('app'),
      scaling,
      conditions: [{ type: 'ScalingPointShifted', status: 'True', reason: 'UtilizationRelativeToRequests', message: 'HPA example-app (memory): the recommended requests shift the scaling point' }],
    });
    expect(html).toContain('Scaling point shifted');
    expect(html).toContain('the recommended requests shift the scaling point');
  });

  test('renders unknown sizing and replica source values as they are', () => {
    const html = render({
      lastAnalysis: lastAnalysis('app'),
      scaling: {
        autoscalers: ['CustomScaler/example-app'],
        replicas: { min: 1, typical: 1, max: 1, source: 'Forecast' },
        containers: [{ name: 'app', cpu: { sizing: 'MLForecast', peakToBaseline: 'n/a' } }],
        reason: 'r',
      },
    });
    expect(html).toContain('MLForecast');
    expect(html).toContain('from Forecast');
    expect(html).toContain('CustomScaler');
    expect(html).toContain('n/a');
    expectClean(html);
  });

  test('survives garbage in every field', () => {
    const html = render({
      lastAnalysis: { containers: 'x' } as never,
      autoscalers: [null, 'x', { kind: { k: 1 }, minReplicas: 'NaN', maxReplicas: Infinity, utilizationTargets: [{ resource: {}, averageUtilization: NaN }], otherMetrics: [{}] }] as never,
      scaling: {
        autoscalers: [{}, 'HorizontalPodAutoscaler/'],
        replicas: { min: NaN, typical: {}, max: null, source: [] },
        alignedResources: 'cpu',
        containers: [{ name: null, cpu: { sizing: null, perPodRequest: {}, request: NaN, targetUtilization: {}, spiky: 1 } }, { cpu: [], memory: 'x' }],
        vpa: [null, { name: {}, updateMode: [], containers: [{ minAllowed: 'x', maxAllowed: { cpu: {}, memory: NaN } }] }],
        conflicts: [{}, { autoscalers: [{}], message: '' }],
        reason: NaN,
      } as never,
      conditions: { type: 'AutoscalerConflict' } as never,
    });
    expect(html).toContain('Scaling');
    expect(html).toContain('2 autoscaler conflicts');
    expect(html).toContain('Autoscaler conflict');
    expect(html).toContain('(unnamed)');
    expectClean(html);
  });

  test('treats empty lists like missing ones', () => {
    const html = render({
      lastAnalysis: lastAnalysis(),
      autoscalers: [],
      scaling: { autoscalers: [], alignedResources: [], containers: [], vpa: [], conflicts: [], reason: '' },
      conditions: [],
    });
    expect(html).toContain('None detected');
    expect(html).not.toContain('Request sizing per container');
    expect(html).not.toContain('role="alert"');
    expectClean(html);
  });
});
