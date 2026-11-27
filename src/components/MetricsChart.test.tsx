import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MetricsChart,
  OBSERVED_P95,
  OBSERVED_P99,
  type MetricsChartForecast,
  type MetricsChartProps,
  type ResourceLine,
} from './MetricsChart';

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

const forecastData = {
  history: [{ timestamp: 1_000, value: 0.4 }],
  forecast: [
    { timestamp: 1_060, value: 0.5, lower: 0.3, upper: 0.7 },
    { timestamp: 1_120, value: 0.55, lower: 0.3, upper: 0.8 },
  ],
  level: 0.95,
  model: 'ARIMA(1,1,1)',
  sampleInterval: 60,
};

const usage = [
  { timestamp: 900, value: 0.3, pod: 'example-app-a' },
  { timestamp: 900, value: 0.5, pod: 'example-app-b' },
  { timestamp: 1_000, value: 0.4, pod: 'example-app-a' },
  { timestamp: 1_000, value: 0.6, pod: 'example-app-b' },
];

const renderChart = (props: Partial<MetricsChartProps> = {}) =>
  renderToStaticMarkup(
    <MetricsChart
      title="CPU Usage & Limits"
      timeSeriesData={usage}
      resourceLines={[{ ...LINES.currentLimit, value: 1 }]}
      resourceType="cpu"
      {...props}
    />,
  );

const forecastProps = (state: Partial<MetricsChartForecast>): MetricsChartForecast => ({
  enabled: true,
  onToggle: () => {},
  ...state,
});

describe('MetricsChart percentile bounds', () => {
  test('adds toggleable legend entries for both bounds', () => {
    const html = renderChart({ percentileBounds: { p95: 0.12, p99: 0.3 } });
    expect(html).toContain(`>${OBSERVED_P95}<`);
    expect(html).toContain(`>${OBSERVED_P99}<`);
    expect(html).not.toContain('NaN');
  });

  test('draws only the bound that is set', () => {
    const html = renderChart({ percentileBounds: { p99: 0.3 } });
    expect(html).not.toContain(OBSERVED_P95);
    expect(html).toContain(OBSERVED_P99);
  });

  test.each([
    ['no bounds', undefined],
    ['empty bounds', {}],
    ['non-finite bounds', { p95: NaN, p99: Infinity }],
  ])('draws nothing for %s', (_, bounds) => {
    const html = renderChart({ percentileBounds: bounds });
    expect(html).not.toContain('Observed P9');
    expect(html).not.toContain('NaN');
  });

  test('renders bounds without usage data or other lines', () => {
    const html = renderChart({ timeSeriesData: [], resourceLines: [], percentileBounds: { p95: 0, p99: 0 } });
    expect(html).not.toContain('No data available');
    expect(html).toContain(OBSERVED_P95);
  });

  test('shows the bounds error', () => {
    const html = renderChart({ percentileBoundsError: 'Observed percentile bounds unavailable: boom' });
    expect(html).toContain('Observed percentile bounds unavailable: boom');
  });

  test('shows the bounds error on the no data card', () => {
    const html = renderChart({ timeSeriesData: [], resourceLines: [], percentileBoundsError: 'bounds failed' });
    expect(html).toContain('No data available');
    expect(html).toContain('bounds failed');
  });
});

describe('MetricsChart forecast', () => {
  test('has no Forecast button without the forecast prop', () => {
    expect(renderChart()).not.toContain('aria-pressed');
  });

  test('shows an unpressed Forecast button and no forecast while disabled', () => {
    const html = renderChart({ forecast: forecastProps({ enabled: false, data: forecastData }) });
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Forecast</button>');
    expect(html).not.toContain('ARIMA');
  });

  test('shows the model and level in the legend', () => {
    const html = renderChart({ forecast: forecastProps({ data: forecastData }) });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Forecast (ARIMA(1,1,1))');
    expect(html).toContain('Forecast 95% interval');
    expect(html).not.toContain('NaN');
  });

  test('keeps the per-pod toggle and the usage legend with a forecast', () => {
    const html = renderChart({ forecast: forecastProps({ data: forecastData }) });
    expect(html).toContain('Per Pod');
    expect(html).toContain('>CPU Usage<');
  });

  test('shows a fallback reason next to a drawn forecast', () => {
    const html = renderChart({ forecast: forecastProps({ data: { ...forecastData, fallbackReason: 'used a naive model' } }) });
    expect(html).toContain('Forecast fallback: used a naive model');
    expect(html).toContain('Forecast (ARIMA(1,1,1))');
  });

  test('shows the fallback reason for an empty forecast', () => {
    const html = renderChart({
      forecast: forecastProps({ data: { ...forecastData, forecast: [], fallbackReason: 'not enough samples' } }),
    });
    expect(html).toContain('No forecast: not enough samples');
    expect(html).not.toContain('Forecast (ARIMA');
  });

  test('explains an empty forecast without a reason', () => {
    const html = renderChart({ forecast: forecastProps({ data: { ...forecastData, forecast: [] } }) });
    expect(html).toContain('No forecast: the server returned no usable forecast points.');
  });

  test('explains a forecast whose points all have null fields', () => {
    const data = { ...forecastData, forecast: [{ timestamp: null, value: null, lower: null, upper: null }] };
    const html = renderChart({ forecast: forecastProps({ data: data as never }) });
    expect(html).toContain('No forecast:');
    expect(html).not.toContain('NaN');
  });

  test('shows the error text of a failed forecast and draws nothing', () => {
    const html = renderChart({ forecast: forecastProps({ data: forecastData, error: 'Prometheus query failed' }) });
    expect(html).toContain('Forecast failed: Prometheus query failed');
    expect(html).not.toContain('Forecast (ARIMA');
  });

  test('shows an unavailable endpoint as information, not a failure', () => {
    const html = renderChart({
      forecast: forecastProps({ error: 'Forecasting is not available on this server.', unavailable: true }),
    });
    expect(html).toContain('Forecasting is not available on this server.');
    expect(html).not.toContain('Forecast failed');
  });

  test('shows loading', () => {
    expect(renderChart({ forecast: forecastProps({ loading: true }) })).toContain('Loading forecast');
  });

  test('handles memory with huge and zero values', () => {
    const html = renderChart({
      resourceType: 'memory',
      timeSeriesData: [{ timestamp: 1_000, value: 0 }],
      percentileBounds: { p95: 0, p99: 8 * 2 ** 40 },
      forecast: forecastProps({
        data: { ...forecastData, forecast: [{ timestamp: 2_000, value: 1e300, lower: 0, upper: 1e308 }] },
      }),
    });
    expect(html).toContain('>Memory Usage<');
    expect(html).toContain('Forecast (ARIMA(1,1,1))');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
});
