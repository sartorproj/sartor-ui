import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TailoringSummary } from '@/lib/api';
import { AnalysisCell, AnalysisHealthSummary } from './TailoringAnalysis';

const NOW = new Date('2026-01-01T12:00:00Z');

const tailoring = (overrides: Partial<TailoringSummary> = {}): TailoringSummary => ({
  name: 'example-app',
  namespace: 'example-namespace',
  targetKind: 'Deployment',
  targetName: 'example-app',
  paused: false,
  targetFound: true,
  vpaDetected: false,
  containerCount: 1,
  readyCondition: 'True',
  ...overrides,
});

const cell = (t: TailoringSummary) => renderToStaticMarkup(<AnalysisCell tailoring={t} now={NOW} />);

describe('AnalysisCell', () => {
  test('shows Never for a Tailoring without any condition', () => {
    const html = cell(tailoring());
    expect(html).toContain('Never');
    expect(html).not.toContain('Retry');
  });

  test('shows the time of the last analysis', () => {
    expect(cell(tailoring({ lastAnalysis: '2026-01-01T11:00:00Z' }))).toContain('about 1 hour ago');
  });

  test('shows the failure reason with the message as a tooltip and the next retry', () => {
    const html = cell(
      tailoring({
        analyzedStatus: 'False',
        analyzedReason: 'TargetNotFound',
        analyzedMessage: 'Deployment example-namespace/example-app not found',
        nextAnalysisTime: '2026-01-01T12:05:00Z',
        consecutiveFailures: 3,
      }),
    );
    expect(html).toContain('Never');
    expect(html).toContain('TargetNotFound');
    expect(html).toContain('title="Deployment example-namespace/example-app not found"');
    expect(html).toContain('Retry in 5 minutes');
    expect(html).toContain('3 failures in a row');
  });

  test('marks a retry time in the past as overdue', () => {
    const html = cell(tailoring({ analyzedStatus: 'False', analyzedReason: 'TargetNotFound', nextAnalysisTime: '2026-01-01T11:50:00Z' }));
    expect(html).toContain('Retry overdue (due 10 minutes ago)');
  });

  test('shows the next scheduled analysis for a healthy Tailoring', () => {
    const html = cell(tailoring({ analyzedStatus: 'True', lastAnalysis: '2026-01-01T11:00:00Z', nextAnalysisTime: '2026-01-01T13:00:00Z' }));
    expect(html).toContain('Next analysis in about 1 hour');
    expect(html).not.toContain('Retry');
  });
});

describe('AnalysisHealthSummary', () => {
  test('counts analyzed and failing by reason', () => {
    const html = renderToStaticMarkup(
      <AnalysisHealthSummary
        now={NOW}
        tailorings={[
          tailoring({ analyzedStatus: 'True' }),
          tailoring({ analyzedStatus: 'False', analyzedReason: 'TargetNotFound' }),
          tailoring({ analyzedStatus: 'False', analyzedReason: 'TargetNotFound' }),
          tailoring(),
        ]}
      />,
    );
    expect(html).toContain('1 analyzed');
    expect(html).toContain('2 failing');
    expect(html).toContain('TargetNotFound: 2');
    expect(html).toContain('1 not analyzed yet');
  });

  test('renders nothing without Tailorings', () => {
    expect(renderToStaticMarkup(<AnalysisHealthSummary tailorings={[]} />)).toBe('');
  });
});
