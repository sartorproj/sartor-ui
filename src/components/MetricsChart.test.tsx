import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MetricsChart, type ResourceLine } from './MetricsChart';

const LINES: Record<string, ResourceLine> = {
  currentRequest: { name: 'Current Request', value: 256, color: 'red', type: 'request', dashed: true },
  currentLimit: { name: 'Current Limit', value: 512, color: 'blue', type: 'limit', dashed: true },
  recommendedRequest: { name: 'Recommended Request', value: 358.4, color: 'green', type: 'recommended' },
  recommendedLimit: { name: 'Recommended Limit', value: 953.7, color: 'purple', type: 'recommended' },
};

const render = (resourceLines?: ResourceLine[]) =>
  renderToStaticMarkup(
    <MetricsChart title="Memory Usage & Limits" timeSeriesData={[]} resourceLines={resourceLines} resourceType="memory" />,
  );

describe('MetricsChart without usage data', () => {
  test('renders every request and limit line', () => {
    const html = render(Object.values(LINES));
    expect(html).not.toContain('No data available');
    for (const line of Object.values(LINES)) {
      expect(html).toContain(line.name);
    }
    expect(html).not.toContain('Memory Usage<');
    expect(html).not.toContain('NaN');
  });

  test('renders only the lines that are set', () => {
    const html = render([LINES.currentRequest, LINES.recommendedRequest]);
    expect(html).not.toContain('No data available');
    expect(html).toContain('Current Request');
    expect(html).toContain('Recommended Request');
    expect(html).not.toContain('Current Limit');
    expect(html).not.toContain('Recommended Limit');
    expect(html).not.toContain('NaN');
  });

  test.each([
    ['no lines', []],
    ['undefined lines', undefined],
  ])('shows the no data notice for %s', (_, lines) => {
    expect(render(lines)).toContain('No data available');
  });

  test('drops lines whose value is not a finite number', () => {
    const html = render([LINES.currentRequest, { ...LINES.currentLimit, value: NaN }, { ...LINES.recommendedLimit, value: Infinity }]);
    expect(html).toContain('Current Request');
    expect(html).not.toContain('Current Limit');
    expect(html).not.toContain('Recommended Limit');
    expect(html).not.toContain('NaN');
  });

  test('shows the no data notice when no line is plottable', () => {
    expect(render([{ ...LINES.currentLimit, value: NaN }])).toContain('No data available');
  });
});
