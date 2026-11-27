import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Tailoring, TailoringSummary } from '@/lib/api';
import { autoscalerOverview } from '@/lib/scaling';
import { AutoscalerIndicator, TailoringAutoscalers } from './AutoscalerIndicator';

const indicator = (status: Partial<Tailoring['status']> | undefined, props: { loading?: boolean; failed?: boolean } = {}) =>
  renderToStaticMarkup(<AutoscalerIndicator overview={autoscalerOverview(status)} {...props} />);

describe('AutoscalerIndicator', () => {
  test('shows HPA, KEDA and VPA badges with the autoscaler names as a tooltip', () => {
    const html = indicator({
      autoscalers: [
        { kind: 'VerticalPodAutoscaler', name: 'example-app', updateMode: 'Off' },
        { kind: 'HorizontalPodAutoscaler', name: 'example-app' },
        { kind: 'ScaledObject', name: 'example-worker' },
      ],
    });
    expect(html.indexOf('>HPA<')).toBeGreaterThan(-1);
    expect(html.indexOf('>HPA<')).toBeLessThan(html.indexOf('>KEDA<'));
    expect(html.indexOf('>KEDA<')).toBeLessThan(html.indexOf('>VPA<'));
    expect(html).toContain('title="VerticalPodAutoscaler/example-app, HorizontalPodAutoscaler/example-app, ScaledObject/example-worker"');
    expect(html).not.toContain('conflict');
  });

  test('shows a dash without autoscalers', () => {
    const html = indicator({ scaling: { autoscalers: [], reason: 'No autoscaler targets the workload.' } });
    expect(html).toContain('title="No autoscaler detected"');
    expect(html).toContain('>-<');
    expect(indicator(undefined)).toContain('>-<');
  });

  test('shows a warning icon listing every conflict', () => {
    const html = indicator({
      scaling: {
        autoscalers: ['HorizontalPodAutoscaler/example-a', 'HorizontalPodAutoscaler/example-b', 'VerticalPodAutoscaler/example-a'],
        conflicts: [
          { resource: 'cpu', autoscalers: ['HorizontalPodAutoscaler/example-a', 'VerticalPodAutoscaler/example-a'], message: 'VPA and HPA both act on cpu' },
          { autoscalers: ['HorizontalPodAutoscaler/example-a', 'HorizontalPodAutoscaler/example-b'], message: '2 horizontal autoscalers' },
        ],
        reason: 'r',
      },
    });
    expect(html).toContain('aria-label="2 autoscaler conflicts: VPA and HPA both act on cpu; 2 horizontal autoscalers"');
    expect(html).toContain('lucide-triangle-alert');
  });

  test('shows the conflict of an AutoscalerConflict condition', () => {
    const html = indicator({ conditions: [{ type: 'AutoscalerConflict', status: 'True', reason: 'AutoscalersConflict', message: 'VPA and HPA both act on memory' }] });
    expect(html).toContain('aria-label="Autoscaler conflict: VPA and HPA both act on memory"');
  });

  test('shows loading and failure states', () => {
    expect(indicator(undefined, { loading: true })).toContain('Loading autoscalers');
    const failed = indicator(undefined, { failed: true });
    expect(failed).toContain('Could not load the autoscalers');
    expect(failed).toContain('>?<');
    const fallback = indicator({ vpaDetected: true }, { failed: true });
    expect(fallback).toContain('>VPA<');
  });

  test('renders unknown kinds as reported and ignores garbage', () => {
    const html = indicator({ autoscalers: [{ kind: 'CustomScaler', name: 'x' }, { kind: { k: 1 } }, null] as never, scaling: 'x' as never });
    expect(html).toContain('>CustomScaler<');
    expect(html).not.toContain('[object Object]');
    expect(html).not.toContain('undefined');
  });
});

describe('TailoringAutoscalers', () => {
  const summary: TailoringSummary = {
    name: 'example-app',
    namespace: 'example-namespace',
    targetKind: 'Deployment',
    targetName: 'example-app',
    paused: false,
    targetFound: true,
    vpaDetected: true,
    containerCount: 1,
    readyCondition: 'True',
  };
  const render = (client: QueryClient) =>
    renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <TailoringAutoscalers summary={summary} />
      </QueryClientProvider>,
    );

  test('uses the loaded Tailoring, shared with the detail page cache', () => {
    const client = new QueryClient();
    client.setQueryData(['tailoring', 'example-namespace', 'example-app'], {
      status: { autoscalers: [{ kind: 'HorizontalPodAutoscaler', name: 'example-app', managedBy: 'example-app' }] },
    });
    const html = render(client);
    expect(html).toContain('>KEDA<');
    expect(html).not.toContain('>VPA<');
  });

  test('falls back to vpaDetected from the list while loading', () => {
    expect(render(new QueryClient())).toContain('>VPA<');
  });
});
