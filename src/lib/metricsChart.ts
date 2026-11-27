import { parseMemory, parseQuantity } from './quantity'

export interface ChartLineValue {
  name: string
  value: number
}

/** Drops lines whose value cannot be plotted (NaN, Infinity). */
export function plottableLines<T extends ChartLineValue>(lines: T[]): T[] {
  return lines.filter((line) => Number.isFinite(line.value))
}

/**
 * Builds evenly spaced points ending at endTimestamp (seconds) that carry each
 * line's value as a constant series, so the chart has an X range to draw the
 * lines over when there is no usage data.
 */
export function placeholderSeries(
  lines: ChartLineValue[],
  endTimestamp: number,
  points = 12,
  stepSeconds = 5 * 60,
): Array<Record<string, number>> {
  const data: Array<Record<string, number>> = []
  for (let i = points - 1; i >= 0; i--) {
    const point: Record<string, number> = { timestamp: endTimestamp - i * stepSeconds }
    lines.forEach((line) => {
      point[line.name] = line.value
    })
    data.push(point)
  }
  return data
}

/**
 * Returns a padded, non-negative, non-empty Y domain covering the finite
 * values. Non-finite values are ignored.
 */
export function computeYDomain(values: Array<number | null | undefined>): [number, number] {
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const minVal = finite.length > 0 ? Math.min(...finite) : 0
  const maxVal = finite.length > 0 ? Math.max(...finite) : 1
  const padding = (maxVal - minVal) * 0.15 || Math.abs(maxVal) * 0.15 || 1
  const lower = Math.max(0, minVal - padding)
  // Padding values near Number.MAX_VALUE overflows to Infinity.
  const upper = Number.isFinite(maxVal + padding) ? maxVal + padding : Number.MAX_VALUE
  return [lower, upper > lower ? upper : lower + 1]
}

/**
 * Collects the values stored under keys in each row, flattening [lower, upper]
 * ranges, for computeYDomain.
 */
export function collectYValues(rows: Array<Record<string, unknown>>, keys: string[]): number[] {
  const values: number[] = []
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key]
      if (Array.isArray(value)) {
        for (const v of value) if (typeof v === 'number') values.push(v)
      } else if (typeof value === 'number') {
        values.push(value)
      }
    }
  }
  return values
}

export interface PercentileBounds {
  /** Observed P95 usage: cores for CPU, MiB for memory. */
  p95?: number
  /** Observed P99 usage: cores for CPU, MiB for memory. */
  p99?: number
}

/**
 * Parses an observed usage quantity from the last analysis into chart units
 * (cores for CPU, MiB for memory). Returns undefined for missing, malformed,
 * negative or non-finite values so that nothing is drawn for them.
 */
export function observedUsage(value: string | null | undefined, resourceType: 'cpu' | 'memory'): number | undefined {
  const base = parseQuantity(value)
  if (base === undefined || base < 0) return undefined
  return resourceType === 'cpu' ? base : parseMemory(value)
}

export function percentileBounds(
  container: { p95CPU?: string | null; p99CPU?: string | null; p95Memory?: string | null; p99Memory?: string | null },
  resourceType: 'cpu' | 'memory',
): PercentileBounds {
  const [p95, p99] = resourceType === 'cpu'
    ? [container.p95CPU, container.p99CPU]
    : [container.p95Memory, container.p99Memory]
  const bounds: PercentileBounds = {}
  const p95Value = observedUsage(p95, resourceType)
  const p99Value = observedUsage(p99, resourceType)
  if (p95Value !== undefined) bounds.p95 = p95Value
  if (p99Value !== undefined) bounds.p99 = p99Value
  return bounds
}

export function hasPercentileBounds(bounds: PercentileBounds | undefined): boolean {
  return bounds?.p95 !== undefined || bounds?.p99 !== undefined
}

export const FORECAST_KEY = 'forecast'
export const FORECAST_RANGE_KEY = 'forecastRange'

/**
 * Keys of the series the Y domain must cover: usage, the given pods (pass none
 * outside the per-pod view), the reference lines and, when it is drawn, the
 * forecast and its interval. Hidden series are left out.
 */
export function visibleSeriesKeys({
  podNames,
  lineNames,
  forecast,
  hidden,
}: {
  podNames: string[]
  lineNames: string[]
  forecast: boolean
  hidden: ReadonlySet<string>
}): string[] {
  return [
    'usage',
    ...podNames.map((pod) => `pod_${pod}`),
    ...lineNames,
    ...(forecast ? [FORECAST_KEY, FORECAST_RANGE_KEY] : []),
  ].filter((key) => !hidden.has(key))
}

export type ChartRow = { timestamp: number } & Record<string, unknown>

export type ForecastRow = {
  timestamp: number
  forecast: number
  /** [lower, upper]; absent when the server sent no usable interval for the point. */
  forecastRange?: [number, number]
}

interface RawPoint {
  timestamp?: unknown
  value?: unknown
  lower?: unknown
  upper?: unknown
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Usage cannot be negative, so the model's values are clamped at zero for display. */
const clampUsage = (v: number) => Math.max(0, v)

/** Sorted, de-duplicated (last wins) points with finite timestamps and values. */
function cleanPoints(points: unknown): RawPoint[] {
  if (!Array.isArray(points)) return []
  const byTimestamp = new Map<number, RawPoint>()
  for (const point of points as RawPoint[]) {
    if (point && isFiniteNumber(point.timestamp) && isFiniteNumber(point.value)) {
      byTimestamp.set(point.timestamp, point)
    }
  }
  return Array.from(byTimestamp.entries()).sort(([a], [b]) => a - b).map(([, p]) => p)
}

export interface ForecastSeries {
  rows: ForecastRow[]
  /** Where the observed history ends and the forecast starts. */
  nowTimestamp?: number
}

/**
 * Turns a forecast response into chart rows that continue the usage series:
 * the first row repeats the last observed point (anchor, usually the last usage
 * point; else the last point of the response's history) with a zero-width
 * interval, and only forecast points after it are kept, so the dashed line
 * starts where usage ends with no gap or overlap on the X axis.
 */
export function forecastSeries(
  response: { history?: unknown; forecast?: unknown } | null | undefined,
  anchor?: { timestamp: number; value: number },
): ForecastSeries {
  let start = anchor && isFiniteNumber(anchor.timestamp) && isFiniteNumber(anchor.value) ? anchor : undefined
  if (!start) {
    const history = cleanPoints(response?.history)
    const last = history[history.length - 1]
    if (last) start = { timestamp: last.timestamp as number, value: last.value as number }
  }

  const rows: ForecastRow[] = []
  for (const point of cleanPoints(response?.forecast)) {
    const timestamp = point.timestamp as number
    if (start && timestamp <= start.timestamp) continue
    const row: ForecastRow = { timestamp, forecast: clampUsage(point.value as number) }
    if (isFiniteNumber(point.lower) && isFiniteNumber(point.upper)) {
      row.forecastRange = [
        clampUsage(Math.min(point.lower, point.upper)),
        clampUsage(Math.max(point.lower, point.upper)),
      ]
    }
    rows.push(row)
  }

  if (!start || rows.length === 0) return { rows }
  const value = clampUsage(start.value)
  return {
    rows: [{ timestamp: start.timestamp, forecast: value, forecastRange: [value, value] }, ...rows],
    nowTimestamp: start.timestamp,
  }
}

/**
 * Merges forecast rows into the chart rows by timestamp. Without forecast rows
 * the input is returned unchanged and xDomain is undefined, so the chart keeps
 * its original axis.
 */
export function withForecast(
  rows: ChartRow[],
  forecast: ForecastRow[] | undefined,
): { data: ChartRow[]; xDomain?: [number, number] } {
  if (!forecast || forecast.length === 0) return { data: rows }
  const byTimestamp = new Map<number, ChartRow>()
  for (const row of rows) byTimestamp.set(row.timestamp, row)
  for (const row of forecast) {
    const existing = byTimestamp.get(row.timestamp)
    byTimestamp.set(row.timestamp, existing ? { ...existing, ...row } : row)
  }
  const data = Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp)
  return { data, xDomain: [data[0].timestamp, data[data.length - 1].timestamp] }
}

/** Describes the forecast model and interval, e.g. "ARIMA(1,1,1), 95% interval". */
export function describeForecast(response: { model?: unknown; level?: unknown } | null | undefined): {
  model?: string
  interval?: string
} {
  const model = typeof response?.model === 'string' && response.model.trim() ? response.model.trim() : undefined
  let interval: string | undefined
  const level = response?.level
  if (isFiniteNumber(level) && level > 0 && level < 100) {
    const percent = level <= 1 ? level * 100 : level
    interval = `${Number(percent.toFixed(1))}% interval`
  }
  return { model, interval }
}
