"use client"

import { Bar, BarChart, Area, AreaChart, CartesianGrid, XAxis, YAxis, Line, LineChart, Tooltip } from "recharts"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ChartData {
  name: string
  current?: number
  recommended?: number
  limit?: number
  p95?: number
  p99?: number
  value?: number
  type?: 'p95' | 'p99'
  unit?: string
  timestamp?: number
}

interface StrategyLine {
  name: string
  value: number
  color?: string
  type?: 'line' | 'area'
}

interface ResourceChartProps {
  title: string
  data: ChartData[]
  type: "bar" | "area" | "line"
  unit?: string
  height?: number
  timeSeriesData?: Array<{ timestamp: number; value: number; type: string }>
  strategyLines?: StrategyLine[]
}

// Format value based on resource type (inferred from title)
const formatResourceValue = (value: number | undefined, title: string): string => {
  if (value === undefined || isNaN(value)) return '-'
  
  const isCPU = title.toLowerCase().includes('cpu')
  
  if (isCPU) {
    // CPU values
    return value < 1 ? `${(value * 1000).toFixed(0)}m` : `${value.toFixed(2)} cores`
  } else {
    // Memory values
    return value >= 1024 ? `${(value / 1024).toFixed(2)} Gi` : `${value.toFixed(0)} Mi`
  }
}

export function ResourceChart({
  title,
  data,
  type,
  unit: _unit,
  height = 300,
  timeSeriesData,
  strategyLines,
}: ResourceChartProps) {
  // Suppress unused variable warning
  void _unit
  if (type === "bar") {
    // Build chart config for bar chart
    const chartConfig: ChartConfig = {
      current: {
        label: "Current",
        color: "hsl(220 70% 50%)",
      },
      recommended: {
        label: "Recommended",
        color: "hsl(160 60% 45%)",
      },
      limit: {
        label: "Limit",
        color: "hsl(30 80% 55%)",
      },
    } satisfies ChartConfig

    // Determine which keys are present
    const hasCurrent = data.some((d) => d.current !== undefined)
    const hasRecommended = data.some((d) => d.recommended !== undefined)
    const hasLimit = data.some((d) => d.limit !== undefined)

    // Custom tooltip for bar chart
    const CustomBarTooltip = ({ active, payload, label }: any) => {
      if (!active || !payload?.length) return null
      
      return (
        <div className="rounded-lg border bg-background p-3 shadow-xl">
          <div className="font-medium text-sm mb-2 border-b pb-2">{label}</div>
          <div className="grid gap-1.5 text-xs">
            {payload.map((entry: any, index: number) => {
              const config = chartConfig[entry.dataKey as keyof typeof chartConfig]
              return (
                <div key={index} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: config?.color || entry.fill }}
                    />
                    <span className="text-muted-foreground">{config?.label || entry.dataKey}</span>
                  </div>
                  <span className="font-mono font-medium">
                    {formatResourceValue(entry.value, title)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="w-full" style={{ height: `${height}px` }}>
            <BarChart
              accessibilityLayer
              data={data}
              margin={{
                left: 12,
                right: 12,
              }}
              barGap={8}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => formatResourceValue(value, title)}
              />
              <Tooltip 
                content={<CustomBarTooltip />}
                cursor={false}
              />
              <ChartLegend content={<ChartLegendContent />} />
              {hasCurrent && (
                <Bar
                  dataKey="current"
                  fill={chartConfig.current.color}
                  radius={[4, 4, 0, 0]}
                  activeBar={{ 
                    fill: "hsl(220 70% 60%)",
                    stroke: "hsl(220 70% 40%)",
                    strokeWidth: 2,
                  }}
                />
              )}
              {hasRecommended && (
                <Bar
                  dataKey="recommended"
                  fill={chartConfig.recommended.color}
                  radius={[4, 4, 0, 0]}
                  activeBar={{ 
                    fill: "hsl(160 60% 55%)",
                    stroke: "hsl(160 60% 35%)",
                    strokeWidth: 2,
                  }}
                />
              )}
              {hasLimit && (
                <Bar
                  dataKey="limit"
                  fill={chartConfig.limit.color}
                  radius={[4, 4, 0, 0]}
                  activeBar={{ 
                    fill: "hsl(30 80% 65%)",
                    stroke: "hsl(30 80% 45%)",
                    strokeWidth: 2,
                  }}
                />
              )}
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    )
  }

  // For area/line charts with time series data
  if (timeSeriesData && timeSeriesData.length > 0) {
    const chartConfig: ChartConfig = {
      usage: {
        label: "Usage",
        color: "hsl(var(--chart-1))",
      },
      current: {
        label: "Current",
        color: "hsl(var(--chart-2))",
      },
      recommended: {
        label: "Recommended",
        color: "hsl(var(--chart-3))",
      },
      min: {
        label: "Min",
        color: "hsl(var(--chart-4))",
      },
      max: {
        label: "Max",
        color: "hsl(var(--chart-5))",
      },
      prediction: {
        label: "Prediction",
        color: "hsl(var(--chart-2))",
      },
    } satisfies ChartConfig

    // Group data by timestamp and average values from multiple pods
    const tempGrouped = new Map<number, { usage: { sum: number; count: number } }>()
    timeSeriesData.forEach(item => {
      if (!tempGrouped.has(item.timestamp)) {
        tempGrouped.set(item.timestamp, { usage: { sum: 0, count: 0 } })
      }
      const entry = tempGrouped.get(item.timestamp)!
      entry.usage.sum += item.value
      entry.usage.count += 1
    })
    
    const groupedData: Array<{ timestamp: number; usage: number; [key: string]: number }> = Array.from(tempGrouped.entries()).map(([timestamp, data]) => ({
      timestamp,
      usage: data.usage.count > 0 ? data.usage.sum / data.usage.count : 0,
    }))

    // Add strategy lines
    if (strategyLines) {
      strategyLines.forEach(line => {
        groupedData.forEach(point => {
          point[line.name] = line.value
        })
      })
    }

    // Sort by timestamp
    groupedData.sort((a, b) => a.timestamp - b.timestamp)

    // Calculate Y-axis domain based on data
    const allValues = groupedData.flatMap(d => {
      const vals: number[] = []
      if (d.usage !== undefined) vals.push(d.usage)
      strategyLines?.forEach(line => {
        if (d[line.name] !== undefined) vals.push(d[line.name])
      })
      return vals
    }).filter(v => v !== undefined && !isNaN(v))
    
    const minVal = allValues.length > 0 ? Math.min(...allValues) : 0
    const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1
    const padding = (maxVal - minVal) * 0.1 || 1
    const yDomain: [number, number] = [Math.max(0, minVal - padding), maxVal + padding]

    const ChartComponent = type === "line" ? LineChart : AreaChart

    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="w-full" style={{ height: `${height}px` }}>
            <ChartComponent
              accessibilityLayer
              data={groupedData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <defs>
                <linearGradient id="fillUsage" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-usage)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-usage)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timestamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => {
                  return new Date(value * 1000).toLocaleTimeString()
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                domain={yDomain}
                tickFormatter={(value) => typeof value === 'number' ? value.toFixed(2) : value}
              />
              <ChartTooltip
                cursor={type === "area"}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(value) => {
                      return new Date(Number(value) * 1000).toLocaleString()
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {type === "area" ? (
                <>
                  <Area
                    dataKey="usage"
                    type="natural"
                    fill="url(#fillUsage)"
                    fillOpacity={0.6}
                    stroke="var(--color-usage)"
                    strokeWidth={2}
                  />
                  {strategyLines?.map((line, idx) => (
                    <Line
                      key={line.name}
                      dataKey={line.name}
                      type="monotone"
                      stroke={line.color || `var(--color-${line.name})`}
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray={idx === 0 ? "0" : "5 5"}
                    />
                  ))}
                </>
              ) : (
                <>
                  <Line
                    dataKey="usage"
                    type="monotone"
                    stroke="var(--color-usage)"
                    strokeWidth={2}
                    dot={false}
                  />
                  {strategyLines?.map((line, idx) => (
                    <Line
                      key={line.name}
                      dataKey={line.name}
                      type="monotone"
                      stroke={line.color || `var(--color-${line.name})`}
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray={idx === 0 ? "0" : "5 5"}
                    />
                  ))}
                </>
              )}
            </ChartComponent>
          </ChartContainer>
        </CardContent>
      </Card>
    )
  }

  // For area charts - data should already be in the format { name, p95?, p99? }
  const hasP95 = data.some((d) => d.p95 !== undefined)
  const hasP99 = data.some((d) => d.p99 !== undefined)
  
  const chartConfig: ChartConfig = {
    p95: {
      label: "P95",
      color: "hsl(var(--chart-1))",
    },
    p99: {
      label: "P99",
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="w-full" style={{ height: `${height}px` }}>
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <defs>
              <linearGradient id="fillP95" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-p95)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-p95)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillP99" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-p99)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-p99)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(value) => String(value)}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {hasP95 && (
              <Area
                dataKey="p95"
                type="natural"
                fill="url(#fillP95)"
                fillOpacity={0.6}
                stroke="var(--color-p95)"
                strokeWidth={2}
              />
            )}
            {hasP99 && (
              <Area
                dataKey="p99"
                type="natural"
                fill="url(#fillP99)"
                fillOpacity={0.6}
                stroke="var(--color-p99)"
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
