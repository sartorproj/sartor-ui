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
  const upper = maxVal + padding
  return [lower, upper > lower ? upper : lower + 1]
}
