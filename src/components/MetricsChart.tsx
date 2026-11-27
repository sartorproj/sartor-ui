"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ReferenceArea,
  ReferenceLine,
} from "recharts"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Cpu, HardDrive, TrendingUp, TrendingDown, Minus, ChartSpline } from "lucide-react"
import {
  collectYValues,
  computeYDomain,
  describeForecast,
  forecastSeries,
  formatChartValue,
  placeholderSeries,
  plottableLines,
  withForecast,
  visibleSeriesKeys,
  FORECAST_KEY,
  FORECAST_RANGE_KEY,
  type ChartRow,
  type PercentileBounds,
} from "@/lib/metricsChart"
import type { PrometheusForecast } from "@/lib/api"

export interface TimeSeriesDataPoint {
  timestamp: number
  value: number
  pod?: string
}

export interface ResourceLine {
  name: string
  value: number
  color: string
  type: 'request' | 'limit' | 'recommended' | 'strategy'
  dashed?: boolean
}

export interface MetricsChartProps {
  title: string
  description?: string
  timeSeriesData: TimeSeriesDataPoint[]
  resourceLines?: ResourceLine[]
  resourceType: 'cpu' | 'memory'
  height?: number
  showTimeRangeSelector?: boolean
  defaultTimeRange?: string
  onTimeRangeChange?: (range: string) => void
  showPerPodToggle?: boolean
  className?: string
  /** Observed P95/P99 usage from the last analysis, drawn as lines with a band between them. */
  percentileBounds?: PercentileBounds
  /** Shown instead of being swallowed when the bounds could not be determined. */
  percentileBoundsError?: string
  /** Enables the Forecast toggle; the parent fetches the forecast on demand. */
  forecast?: MetricsChartForecast
}

export interface MetricsChartForecast {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  loading?: boolean
  data?: PrometheusForecast
  error?: string
  /** The error means the server has no forecast endpoint rather than a failure. */
  unavailable?: boolean
}

export const OBSERVED_P95 = "Observed P95"
export const OBSERVED_P99 = "Observed P99"
const BOUND_COLOR = "hsl(25 95% 55%)"
// Theme-tuned in index.css so the usage area is readable on light and dark backgrounds.
const USAGE_COLOR = "var(--color-chart-usage)"

const TIME_RANGES = [
  { value: "15m", label: "15 min" },
  { value: "1h", label: "1 hour" },
  { value: "3h", label: "3 hours" },
  { value: "6h", label: "6 hours" },
  { value: "12h", label: "12 hours" },
  { value: "24h", label: "24 hours" },
  // Sent to the server as a Go duration, which has no "d" unit.
  { value: "168h", label: "7 days" },
]

// Color palette for multiple pods
const POD_COLORS = [
  "hsl(220 70% 50%)",    // Blue
  "hsl(160 60% 45%)",    // Teal
  "hsl(280 65% 60%)",    // Purple
  "hsl(30 80% 55%)",     // Orange
  "hsl(340 75% 55%)",    // Pink
  "hsl(180 60% 45%)",    // Cyan
  "hsl(45 90% 50%)",     // Yellow
  "hsl(200 80% 50%)",    // Light Blue
]

export function MetricsChart({
  title,
  description,
  timeSeriesData,
  resourceLines: rawResourceLines,
  resourceType,
  height = 350,
  showTimeRangeSelector = true,
  defaultTimeRange = "1h",
  onTimeRangeChange,
  showPerPodToggle = true,
  className,
  percentileBounds,
  percentileBoundsError,
  forecast,
}: MetricsChartProps) {
  const [timeRange, setTimeRange] = React.useState(defaultTimeRange)
  const [showPerPod, setShowPerPod] = React.useState(false)
  const [hiddenSeries, setHiddenSeries] = React.useState<Set<string>>(new Set())
  const p95 = percentileBounds?.p95
  const p99 = percentileBounds?.p99
  const resourceLines = React.useMemo(() => {
    const boundLines: ResourceLine[] = []
    if (p95 !== undefined) {
      boundLines.push({ name: OBSERVED_P95, value: p95, color: BOUND_COLOR, type: 'strategy', dashed: true })
    }
    if (p99 !== undefined) {
      boundLines.push({ name: OBSERVED_P99, value: p99, color: BOUND_COLOR, type: 'strategy', dashed: true })
    }
    return plottableLines([...(rawResourceLines ?? []), ...boundLines])
  }, [rawResourceLines, p95, p99])
  const band = React.useMemo(() => {
    const lower = resourceLines.find((l) => l.name === OBSERVED_P95)?.value
    const upper = resourceLines.find((l) => l.name === OBSERVED_P99)?.value
    if (lower === undefined || upper === undefined) return undefined
    return { y1: Math.min(lower, upper), y2: Math.max(lower, upper) }
  }, [resourceLines])

  // Process data to support per-pod view
  const { chartData, chartConfig, podNames } = React.useMemo(() => {
    if (!timeSeriesData || timeSeriesData.length === 0) {
      return { chartData: [], chartConfig: {} as ChartConfig, podNames: [] }
    }

    // Group by timestamp
    const timeGroups = new Map<number, { values: number[]; pods: Map<string, number> }>()
    const uniquePods = new Set<string>()

    timeSeriesData.forEach((point) => {
      if (!timeGroups.has(point.timestamp)) {
        timeGroups.set(point.timestamp, { values: [], pods: new Map() })
      }
      const group = timeGroups.get(point.timestamp)!
      group.values.push(point.value)
      
      if (point.pod) {
        uniquePods.add(point.pod)
        group.pods.set(point.pod, point.value)
      }
    })

    const podList = Array.from(uniquePods).sort()
    
    // Build chart data
    const data = Array.from(timeGroups.entries())
      .sort(([a], [b]) => a - b)
      .map(([timestamp, group]) => {
        const avgValue = group.values.reduce((a, b) => a + b, 0) / group.values.length
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: Record<string, any> = {
          timestamp,
          usage: avgValue,
        }
        
        // Add per-pod values
        podList.forEach((pod) => {
          result[`pod_${pod}`] = group.pods.get(pod) ?? null
        })
        
        // Add resource lines as constant values
        resourceLines.forEach((line) => {
          result[line.name] = line.value
        })
        
        return result
      })

    // Build chart config
    const config: ChartConfig = {
      usage: {
        label: resourceType === 'cpu' ? "CPU Usage (cores)" : "Memory Usage (MiB)",
        color: USAGE_COLOR,
      },
    }

    // Add per-pod configs
    podList.forEach((pod, idx) => {
      config[`pod_${pod}`] = {
        label: pod,
        color: POD_COLORS[idx % POD_COLORS.length],
      }
    })

    // Add resource line configs
    resourceLines.forEach((line) => {
      config[line.name] = {
        label: line.name,
        color: line.color,
      }
    })

    return { chartData: data, chartConfig: config, podNames: podList }
  }, [timeSeriesData, resourceLines, resourceType])

  // Calculate statistics
  const stats = React.useMemo(() => {
    if (chartData.length === 0) return null
    
    const values = chartData.map((d) => d.usage).filter((v) => v != null && !isNaN(v))
    if (values.length === 0) return null
    
    const min = Math.min(...values)
    const max = Math.max(...values)
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    const latest = values[values.length - 1]
    const first = values[0]
    const trend = latest > first ? 'up' : latest < first ? 'down' : 'stable'
    
    return { min, max, avg, latest, trend }
  }, [chartData])

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value)
    onTimeRangeChange?.(value)
  }

  const toggleSeries = (dataKey: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev)
      if (next.has(dataKey)) {
        next.delete(dataKey)
      } else {
        next.add(dataKey)
      }
      return next
    })
  }

  const formatValue = (value: number | undefined) => formatChartValue(value, resourceType, 'tooltip')

  const formatYAxis = (value: number) => formatChartValue(value, resourceType, 'axis')

  // If no time series data but we have resource lines, generate placeholder chart data
  const hasResourceLines = resourceLines.length > 0
  const hasTimeSeriesData = chartData && chartData.length > 0
  
  // Get current timestamp once for placeholder data generation
  const [placeholderTimestamp] = React.useState(() => Math.floor(Date.now() / 1000))
  
  // Generate placeholder data (last hour, 12 points) if we have resource lines but no time series
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const displayData: Record<string, any>[] = React.useMemo(() => {
    if (hasTimeSeriesData) return chartData
    if (!hasResourceLines) return []
    return placeholderSeries(resourceLines, placeholderTimestamp)
  }, [chartData, hasTimeSeriesData, hasResourceLines, resourceLines, placeholderTimestamp])

  const forecastData = forecast?.enabled && !forecast.error ? forecast.data : undefined
  const lastUsage = chartData[chartData.length - 1]
  const lastUsageTimestamp: number | undefined = lastUsage?.timestamp
  const lastUsageValue: number | undefined = lastUsage?.usage
  const forecastResult = React.useMemo(() => {
    if (!forecastData) return undefined
    const anchor = lastUsageTimestamp !== undefined && lastUsageValue !== undefined
      ? { timestamp: lastUsageTimestamp, value: lastUsageValue }
      : undefined
    return forecastSeries(forecastData, anchor)
  }, [forecastData, lastUsageTimestamp, lastUsageValue])
  const forecastShown = !!forecastResult && forecastResult.rows.length > 0
  const forecastInfo = describeForecast(forecastData)

  // Without a forecast this is displayData and the original category X axis.
  const { data: plotData, xDomain } = React.useMemo(
    () => withForecast(displayData as ChartRow[], forecastShown ? forecastResult.rows : undefined),
    [displayData, forecastShown, forecastResult],
  )

  if (displayData.length === 0 && !hasResourceLines) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            {resourceType === 'cpu' ? (
              <Cpu className="h-5 w-5 text-primary" />
            ) : (
              <HardDrive className="h-5 w-5 text-primary" />
            )}
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div 
            className="flex items-center justify-center text-muted-foreground bg-muted/30 rounded-lg"
            style={{ height: `${height}px` }}
          >
            <div className="text-center">
              <p className="text-sm">No data available</p>
              <p className="text-xs mt-1">No resource limits or Prometheus metrics found</p>
              {percentileBoundsError && (
                <p role="status" className="text-xs mt-2 text-red-600 dark:text-red-400">{percentileBoundsError}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const yKeys = visibleSeriesKeys({
    podNames: showPerPod ? podNames : [],
    lineNames: resourceLines.map((line) => line.name),
    forecast: forecastShown,
    hidden: hiddenSeries,
  })
  const yDomain = computeYDomain(collectYValues(plotData, yKeys))

  const formatXTick = (value: number) => {
    const date = new Date(value * 1000)
    // A forecast usually spans more than a day, so its ticks also need the date.
    if (xDomain && xDomain[1] - xDomain[0] > 24 * 60 * 60) {
      return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const notices: Array<{ text: string; tone: 'error' | 'info' }> = []
  if (percentileBoundsError) notices.push({ text: percentileBoundsError, tone: 'error' })
  if (forecast?.enabled) {
    if (forecast.error) {
      notices.push({
        text: forecast.unavailable ? forecast.error : `Forecast failed: ${forecast.error}`,
        tone: forecast.unavailable ? 'info' : 'error',
      })
    } else if (forecast.loading) {
      notices.push({ text: 'Loading forecast…', tone: 'info' })
    } else if (forecastData && !forecastShown) {
      notices.push({
        text: `No forecast: ${forecastData.fallbackReason?.trim() || 'the server returned no usable forecast points.'}`,
        tone: 'error',
      })
    } else if (forecastShown && forecastData?.fallbackReason?.trim()) {
      notices.push({ text: `Forecast fallback: ${forecastData.fallbackReason.trim()}`, tone: 'info' })
    }
  }
  const forecastLabel = forecastInfo.model ? `Forecast (${forecastInfo.model})` : 'Forecast'

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {resourceType === 'cpu' ? (
              <Cpu className="h-5 w-5 text-primary" />
            ) : (
              <HardDrive className="h-5 w-5 text-primary" />
            )}
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              {description && <CardDescription className="text-xs">{description}</CardDescription>}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            {/* Stats badges */}
            {stats && (
              <div className="hidden lg:flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono gap-1">
                  {stats.trend === 'up' && <TrendingUp className="h-3 w-3 text-orange-500" />}
                  {stats.trend === 'down' && <TrendingDown className="h-3 w-3 text-green-500" />}
                  {stats.trend === 'stable' && <Minus className="h-3 w-3 text-muted-foreground" />}
                  {formatValue(stats.latest)}
                </Badge>
                <Badge variant="secondary" className="text-xs font-mono">
                  avg: {formatValue(stats.avg)}
                </Badge>
                <Badge variant="secondary" className="text-xs font-mono">
                  max: {formatValue(stats.max)}
                </Badge>
              </div>
            )}
            
            {/* Per-pod toggle */}
            {showPerPodToggle && podNames.length > 1 && (
              <div className="flex items-center gap-2">
                <Switch
                  id="per-pod-toggle"
                  checked={showPerPod}
                  onCheckedChange={setShowPerPod}
                />
                <Label htmlFor="per-pod-toggle" className="text-xs cursor-pointer">
                  Per Pod
                </Label>
              </div>
            )}
            
            {forecast && (
              <Button
                type="button"
                variant={forecast.enabled ? 'secondary' : 'outline'}
                size="sm"
                aria-pressed={forecast.enabled}
                onClick={() => forecast.onToggle(!forecast.enabled)}
              >
                <ChartSpline />
                Forecast
              </Button>
            )}

            {/* Time range selector */}
            {showTimeRangeSelector && (
              <Select value={timeRange} onValueChange={handleTimeRangeChange}>
                <SelectTrigger className="w-[110px] h-8 text-xs">
                  <SelectValue placeholder="Time range" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map((range) => (
                    <SelectItem key={range.value} value={range.value} className="text-xs">
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pb-4">
        {/* Custom legend for resource lines */}
        {(resourceLines.length > 0 || hasTimeSeriesData) && (
          <div className="flex flex-wrap items-center justify-center gap-3 mb-3 text-xs">
            {/* Usage legend item - only show if we have time series data */}
            {hasTimeSeriesData && (
              <button
                onClick={() => toggleSeries('usage')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/50 transition-colors ${
                  hiddenSeries.has('usage') ? 'opacity-40' : ''
                }`}
              >
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: `color-mix(in srgb, ${USAGE_COLOR} 25%, transparent)`, border: `2px solid ${USAGE_COLOR}` }}
                />
                <span>{resourceType === 'cpu' ? 'CPU Usage' : 'Memory Usage'}</span>
              </button>
            )}

            {forecastShown && (
              <>
                <button
                  onClick={() => toggleSeries(FORECAST_KEY)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/50 transition-colors ${
                    hiddenSeries.has(FORECAST_KEY) ? 'opacity-40' : ''
                  }`}
                >
                  <div className="w-5" style={{ borderTop: `2px dashed ${USAGE_COLOR}` }} />
                  <span>{forecastLabel}</span>
                </button>
                <button
                  onClick={() => toggleSeries(FORECAST_RANGE_KEY)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/50 transition-colors ${
                    hiddenSeries.has(FORECAST_RANGE_KEY) ? 'opacity-40' : ''
                  }`}
                >
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: `color-mix(in srgb, ${USAGE_COLOR} 25%, transparent)` }}
                  />
                  <span>{forecastInfo.interval ? `Forecast ${forecastInfo.interval}` : 'Forecast interval'}</span>
                </button>
              </>
            )}
            
            {/* Resource line legend items */}
            {resourceLines.map((line) => (
              <button
                key={line.name}
                onClick={() => toggleSeries(line.name)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/50 transition-colors ${
                  hiddenSeries.has(line.name) ? 'opacity-40' : ''
                }`}
              >
                <div 
                  className="w-5 h-0.5"
                  style={{ 
                    backgroundColor: line.color,
                    borderStyle: line.dashed ? 'dashed' : 'solid',
                  }}
                />
                <span>{line.name}</span>
              </button>
            ))}
          </div>
        )}

        {notices.length > 0 && (
          <div role="status" className="mb-3 space-y-1 text-center text-xs">
            {notices.map((notice) => (
              <p key={notice.text} className={notice.tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}>
                {notice.text}
              </p>
            ))}
          </div>
        )}

        <ChartContainer config={chartConfig} className="w-full" style={{ height: `${height}px` }}>
          <AreaChart
            accessibilityLayer
            data={plotData}
            margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
          >
            <defs>
              {podNames.map((pod) => (
                <linearGradient key={pod} id={`gradient-pod-${pod}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(--color-pod_${pod})`} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={`var(--color-pod_${pod})`} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
            
            <XAxis
              dataKey="timestamp"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={50}
              tick={{ fontSize: 11 }}
              tickFormatter={formatXTick}
              // Forecast points are not spaced like the usage samples, so a time axis is needed to
              // place them; without a forecast the original category axis is kept.
              {...(xDomain ? { type: 'number' as const, domain: xDomain } : {})}
            />
            
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 11 }}
              domain={yDomain}
              tickFormatter={formatYAxis}
              width={45}
            />
            
            <ChartTooltip
              cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                
                const timestamp = label as number
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const dataPoint: Record<string, any> | undefined = plotData.find(d => d.timestamp === timestamp)
                if (!dataPoint) return null
                const forecastValue: number | undefined = forecastShown && !hiddenSeries.has(FORECAST_KEY)
                  ? dataPoint[FORECAST_KEY]
                  : undefined
                const forecastRange: [number, number] | undefined = forecastShown && !hiddenSeries.has(FORECAST_RANGE_KEY)
                  ? dataPoint[FORECAST_RANGE_KEY]
                  : undefined
                
                return (
                  <div className="rounded-lg border bg-background p-3 shadow-xl">
                    <div className="font-medium text-sm mb-2 border-b pb-2">
                      {new Date(timestamp * 1000).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <div className="grid gap-1.5 text-xs">
                      {/* Usage value - only show if we have time series data */}
                      {hasTimeSeriesData && !hiddenSeries.has('usage') && dataPoint.usage !== undefined && (
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-sm"
                              style={{ backgroundColor: USAGE_COLOR }}
                            />
                            <span className="text-muted-foreground">
                              {resourceType === 'cpu' ? 'CPU Usage' : 'Memory Usage'}
                            </span>
                          </div>
                          <span className="font-mono font-medium">
                            {formatValue(dataPoint.usage)}
                          </span>
                        </div>
                      )}
                      
                      {/* Per-pod values */}
                      {showPerPod && podNames.map((pod) => {
                        const value = dataPoint[`pod_${pod}`]
                        if (hiddenSeries.has(`pod_${pod}`) || value === undefined || value === null) return null
                        const podIndex = podNames.indexOf(pod)
                        return (
                          <div key={pod} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-2.5 h-2.5 rounded-sm"
                                style={{ backgroundColor: POD_COLORS[podIndex % POD_COLORS.length] }}
                              />
                              <span className="text-muted-foreground">{pod}</span>
                            </div>
                            <span className="font-mono font-medium">
                              {formatValue(value)}
                            </span>
                          </div>
                        )
                      })}

                      {(forecastValue !== undefined || forecastRange) && (
                        <>
                          <div className="border-t my-1" />
                          {forecastValue !== undefined && (
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-4" style={{ borderTop: `2px dashed ${USAGE_COLOR}` }} />
                                <span className="text-muted-foreground">Forecast</span>
                              </div>
                              <span className="font-mono font-medium">{formatValue(forecastValue)}</span>
                            </div>
                          )}
                          {forecastRange && (
                            <>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground pl-6">Lower</span>
                                <span className="font-mono font-medium">{formatValue(forecastRange[0])}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground pl-6">Upper</span>
                                <span className="font-mono font-medium">{formatValue(forecastRange[1])}</span>
                              </div>
                            </>
                          )}
                          {(forecastInfo.model || forecastInfo.interval) && (
                            <div className="text-[10px] text-muted-foreground">
                              {[forecastInfo.model, forecastInfo.interval].filter(Boolean).join(', ')}
                            </div>
                          )}
                        </>
                      )}

                      {/* Resource lines */}
                      {resourceLines.length > 0 && (
                        <>
                          <div className="border-t my-1" />
                          {resourceLines.map((line) => {
                            if (hiddenSeries.has(line.name)) return null
                            return (
                              <div key={line.name} className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-4 h-0.5"
                                    style={{ 
                                      backgroundColor: line.color,
                                      borderTop: line.dashed ? `2px dashed ${line.color}` : 'none',
                                    }}
                                  />
                                  <span className="text-muted-foreground">{line.name}</span>
                                </div>
                                <span className="font-mono font-medium">
                                  {formatValue(line.value)}
                                </span>
                              </div>
                            )
                          })}
                        </>
                      )}
                    </div>
                  </div>
                )
              }}
            />
            
            {/* Main usage area (when not showing per-pod and we have time series data) */}
            {band && !hiddenSeries.has(OBSERVED_P95) && !hiddenSeries.has(OBSERVED_P99) && (
              <ReferenceArea
                y1={band.y1}
                y2={band.y2}
                fill={BOUND_COLOR}
                fillOpacity={0.1}
                stroke="none"
                zIndex={50}
              />
            )}

            {hasTimeSeriesData && !showPerPod && !hiddenSeries.has('usage') && (
              <Area
                dataKey="usage"
                type="monotone"
                fill={USAGE_COLOR}
                fillOpacity={0.2}
                stroke={USAGE_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
            )}

            {forecastShown && !hiddenSeries.has(FORECAST_RANGE_KEY) && (
              <Area
                dataKey={FORECAST_RANGE_KEY}
                type="monotone"
                fill={USAGE_COLOR}
                fillOpacity={0.12}
                stroke="none"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            )}

            {forecastShown && !hiddenSeries.has(FORECAST_KEY) && (
              <Area
                dataKey={FORECAST_KEY}
                type="monotone"
                fill="none"
                stroke={USAGE_COLOR}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )}

            {forecastShown && forecastResult.nowTimestamp !== undefined && (
              <ReferenceLine
                x={forecastResult.nowTimestamp}
                stroke="var(--color-muted-foreground)"
                strokeOpacity={0.6}
                strokeDasharray="2 3"
                zIndex={150}
                label={{
                  value: 'now',
                  position: 'insideTopLeft',
                  fill: 'var(--color-muted-foreground)',
                  fontSize: 10,
                }}
              />
            )}
            
            {/* Without a series recharts lays out no Y axis, so the reference lines below
                would not be drawn; this invisible series pins the axis to yDomain. */}
            {!hasTimeSeriesData && (
              <Area
                dataKey={() => yDomain[0]}
                stroke="none"
                fill="none"
                dot={false}
                activeDot={false}
                legendType="none"
                isAnimationActive={false}
              />
            )}
            
            {/* Per-pod lines - only show if we have time series data */}
            {hasTimeSeriesData && showPerPod && podNames.map((pod) => (
              !hiddenSeries.has(`pod_${pod}`) && (
                <Area
                  key={pod}
                  dataKey={`pod_${pod}`}
                  type="monotone"
                  fill={`url(#gradient-pod-${pod})`}
                  stroke={`var(--color-pod_${pod})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 1 }}
                  connectNulls
                />
              )
            ))}
            
            {/* Resource reference lines (requests, limits, recommendations) */}
            {resourceLines.map((line) => (
              !hiddenSeries.has(line.name) && (
                <ReferenceLine
                  key={line.name}
                  y={line.value}
                  stroke={line.color}
                  strokeWidth={2}
                  strokeDasharray={line.dashed ? "6 4" : undefined}
                  label={{
                    value: line.name,
                    position: 'right',
                    fill: line.color,
                    fontSize: 10,
                  }}
                />
              )
            ))}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
