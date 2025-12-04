import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import type { ResourceAnalytics, CostAnalytics, ClusterResourceSummary } from '../lib/api';
import {
  Cpu,
  MemoryStick,
  Server,
  DollarSign,
  TrendingUp,
  Activity,
  Box,
  AlertCircle,
  CheckCircle,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  RadialBarChart,
  RadialBar,
} from 'recharts';

const COLORS = {
  cpu: '#3b82f6',      // blue
  memory: '#10b981',   // emerald
  gpu: '#f59e0b',      // amber
  available: '#6366f1', // indigo
  used: '#ef4444',     // red
  namespace1: '#8b5cf6', // violet
  namespace2: '#ec4899', // pink
  namespace3: '#14b8a6', // teal
  namespace4: '#f97316', // orange
  namespace5: '#84cc16', // lime
};

const NAMESPACE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#84cc16', '#6366f1', '#ef4444',
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(2)}k`;
  }
  return `$${value.toFixed(4)}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatCores(value: number): string {
  if (value >= 1) {
    return `${value.toFixed(2)} cores`;
  }
  return `${(value * 1000).toFixed(0)}m`;
}

export default function Analytics() {
  // Fetch OpenCost health status
  const { data: healthStatus, isLoading: healthLoading } = useQuery({
    queryKey: ['opencost-health'],
    queryFn: () => apiClient.getOpenCostHealth(),
    refetchInterval: 60000,
  });

  // Fetch resource analytics
  const { data: resourceAnalytics } = useQuery<ResourceAnalytics>({
    queryKey: ['opencost-resource-analytics'],
    queryFn: () => apiClient.getOpenCostResourceAnalytics(),
    enabled: healthStatus?.connected ?? false,
    refetchInterval: 30000,
  });

  // Fetch cost analytics
  const { data: costAnalytics } = useQuery<CostAnalytics>({
    queryKey: ['opencost-cost-analytics'],
    queryFn: () => apiClient.getOpenCostCostAnalytics(),
    enabled: healthStatus?.connected ?? false,
    refetchInterval: 30000,
  });

  // Fetch cluster summary
  const { data: clusterSummary } = useQuery<ClusterResourceSummary>({
    queryKey: ['opencost-cluster-summary'],
    queryFn: () => apiClient.getOpenCostClusterSummary(),
    enabled: healthStatus?.connected ?? false,
    refetchInterval: 30000,
  });

  // If OpenCost is not enabled/connected, show a message
  if (!healthLoading && (!healthStatus?.enabled || !healthStatus?.connected)) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Resource Analytics</h1>
          <p className="mt-2 text-muted-foreground">
            Real-time cluster resource analytics powered by OpenCost metrics
          </p>
        </div>

        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                  OpenCost Integration Required
                </h3>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  {!healthStatus?.enabled
                    ? 'OpenCost integration is not enabled. Configure it in your Atelier resource.'
                    : `Unable to connect to OpenCost: ${healthStatus?.error || 'Unknown error'}`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Prepare chart data
  const cpuByNamespaceData = Object.entries(resourceAnalytics?.cpuByNamespace || {})
    .map(([name, value], index) => ({
      name,
      value,
      fill: NAMESPACE_COLORS[index % NAMESPACE_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const memoryByNamespaceData = Object.entries(resourceAnalytics?.memoryByNamespace || {})
    .map(([name, value], index) => ({
      name,
      value: value / (1024 * 1024), // Convert to MB
      fill: NAMESPACE_COLORS[index % NAMESPACE_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const utilizationGaugeData = [
    {
      name: 'CPU',
      value: resourceAnalytics?.cpuUtilizationPercent || 0,
      fill: COLORS.cpu,
    },
    {
      name: 'Memory',
      value: resourceAnalytics?.memoryUtilizationPercent || 0,
      fill: COLORS.memory,
    },
  ];

  const costByNamespaceData = Object.entries(costAnalytics?.costByNamespace || {})
    .map(([name, value], index) => ({
      name,
      cost: value,
      fill: NAMESPACE_COLORS[index % NAMESPACE_COLORS.length],
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 8);

  const costBreakdownData = [
    { name: 'CPU', value: costAnalytics?.cpuHourlyCost || 0, fill: COLORS.cpu },
    { name: 'Memory', value: costAnalytics?.ramHourlyCost || 0, fill: COLORS.memory },
    { name: 'GPU', value: costAnalytics?.gpuHourlyCost || 0, fill: COLORS.gpu },
    { name: 'Storage', value: costAnalytics?.storageHourlyCost || 0, fill: '#8b5cf6' },
    { name: 'Network', value: costAnalytics?.networkHourlyCost || 0, fill: '#ec4899' },
  ].filter(item => item.value > 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Resource Analytics</h1>
          <p className="mt-2 text-muted-foreground">
            Real-time cluster resource analytics powered by OpenCost metrics
          </p>
        </div>

        <Badge
          variant="outline"
          className={
            healthStatus?.connected
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }
        >
          {healthStatus?.connected ? (
            <>
              <CheckCircle className="w-3 h-3 mr-1" />
              Live Data
            </>
          ) : (
            <>
              <AlertCircle className="w-3 h-3 mr-1" />
              Disconnected
            </>
          )}
        </Badge>
      </div>

      {/* Cluster Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Total CPU</p>
                <p className="mt-1 text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {clusterSummary?.totalCpuCores.toFixed(1)} cores
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {clusterSummary?.allocatedCpuCores.toFixed(2)} allocated
                </p>
              </div>
              <div className="p-3 bg-blue-200 dark:bg-blue-800 rounded-full">
                <Cpu className="w-6 h-6 text-blue-700 dark:text-blue-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/50 dark:to-emerald-900/30 border-emerald-200 dark:border-emerald-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Total Memory</p>
                <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                  {clusterSummary?.totalMemoryGb.toFixed(1)} GB
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  {clusterSummary?.allocatedMemoryGb.toFixed(2)} GB allocated
                </p>
              </div>
              <div className="p-3 bg-emerald-200 dark:bg-emerald-800 rounded-full">
                <MemoryStick className="w-6 h-6 text-emerald-700 dark:text-emerald-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950/50 dark:to-violet-900/30 border-violet-200 dark:border-violet-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-violet-700 dark:text-violet-300">Workloads</p>
                <p className="mt-1 text-2xl font-bold text-violet-900 dark:text-violet-100">
                  {clusterSummary?.totalPods || 0} pods
                </p>
                <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                  {clusterSummary?.totalContainers || 0} containers
                </p>
              </div>
              <div className="p-3 bg-violet-200 dark:bg-violet-800 rounded-full">
                <Box className="w-6 h-6 text-violet-700 dark:text-violet-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/50 dark:to-amber-900/30 border-amber-200 dark:border-amber-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Monthly Cost</p>
                <p className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-100">
                  {formatCurrency(costAnalytics?.monthlyCost || 0)}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {formatCurrency(costAnalytics?.totalHourlyCost || 0)}/hr
                </p>
              </div>
              <div className="p-3 bg-amber-200 dark:bg-amber-800 rounded-full">
                <DollarSign className="w-6 h-6 text-amber-700 dark:text-amber-300" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Utilization Gauges */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Resource Utilization
            </CardTitle>
            <CardDescription>Current allocation vs capacity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="30%"
                  outerRadius="90%"
                  data={utilizationGaugeData}
                  startAngle={180}
                  endAngle={0}
                >
                  <RadialBar
                    dataKey="value"
                    cornerRadius={10}
                    background={{ fill: 'hsl(var(--muted))' }}
                  />
                  <Legend
                    iconSize={10}
                    layout="horizontal"
                    verticalAlign="bottom"
                    formatter={(value, entry) => (
                      <span className="text-sm">
                        {value}: {(entry.payload as any)?.value?.toFixed(1)}%
                      </span>
                    )}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Utilization']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <p className="text-sm text-muted-foreground">CPU Utilization</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {formatPercent(resourceAnalytics?.cpuUtilizationPercent || 0)}
                </p>
              </div>
              <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                <p className="text-sm text-muted-foreground">Memory Utilization</p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatPercent(resourceAnalytics?.memoryUtilizationPercent || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Cost Breakdown
            </CardTitle>
            <CardDescription>Hourly cost by resource type</CardDescription>
          </CardHeader>
          <CardContent>
            {costBreakdownData.length > 0 ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costBreakdownData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {costBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No cost data available
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="text-center p-2 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Hourly</p>
                <p className="text-sm font-bold">{formatCurrency(costAnalytics?.totalHourlyCost || 0)}</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Daily</p>
                <p className="text-sm font-bold">{formatCurrency(costAnalytics?.dailyCost || 0)}</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Monthly</p>
                <p className="text-sm font-bold">{formatCurrency(costAnalytics?.monthlyCost || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resource Distribution */}
      <Tabs defaultValue="cpu" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cpu" className="flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            CPU by Namespace
          </TabsTrigger>
          <TabsTrigger value="memory" className="flex items-center gap-2">
            <MemoryStick className="w-4 h-4" />
            Memory by Namespace
          </TabsTrigger>
          <TabsTrigger value="top-consumers" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Top Consumers
          </TabsTrigger>
          <TabsTrigger value="cost-by-ns" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Cost by Namespace
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cpu">
          <Card>
            <CardHeader>
              <CardTitle>CPU Allocation by Namespace</CardTitle>
              <CardDescription>CPU cores allocated to each namespace</CardDescription>
            </CardHeader>
            <CardContent>
              {cpuByNamespaceData.length > 0 ? (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cpuByNamespaceData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        type="number"
                        tickFormatter={(value) => `${value.toFixed(2)}`}
                        className="text-xs"
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        className="text-xs"
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCores(value), 'CPU']}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {cpuByNamespaceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                  No CPU data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="memory">
          <Card>
            <CardHeader>
              <CardTitle>Memory Allocation by Namespace</CardTitle>
              <CardDescription>Memory allocated to each namespace</CardDescription>
            </CardHeader>
            <CardContent>
              {memoryByNamespaceData.length > 0 ? (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={memoryByNamespaceData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        type="number"
                        tickFormatter={(value) => `${value.toFixed(0)} MB`}
                        className="text-xs"
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        className="text-xs"
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value: number) => [`${value.toFixed(1)} MB`, 'Memory']}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {memoryByNamespaceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                  No memory data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="top-consumers">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-blue-500" />
                  Top CPU Consumers
                </CardTitle>
                <CardDescription>Containers using the most CPU</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {resourceAnalytics?.topCpuConsumers?.slice(0, 8).map((consumer, index) => (
                    <div
                      key={consumer.name}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg font-bold text-muted-foreground w-6">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium truncate text-sm">{consumer.container}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {consumer.namespace}/{consumer.pod}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          {formatCores(consumer.value)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {consumer.percent.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                  {(!resourceAnalytics?.topCpuConsumers || resourceAnalytics.topCpuConsumers.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                      No data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MemoryStick className="w-5 h-5 text-emerald-500" />
                  Top Memory Consumers
                </CardTitle>
                <CardDescription>Containers using the most memory</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {resourceAnalytics?.topMemoryConsumers?.slice(0, 8).map((consumer, index) => (
                    <div
                      key={consumer.name}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg font-bold text-muted-foreground w-6">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium truncate text-sm">{consumer.container}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {consumer.namespace}/{consumer.pod}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatBytes(consumer.value)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {consumer.percent.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                  {(!resourceAnalytics?.topMemoryConsumers || resourceAnalytics.topMemoryConsumers.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                      No data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cost-by-ns">
          <Card>
            <CardHeader>
              <CardTitle>Estimated Hourly Cost by Namespace</CardTitle>
              <CardDescription>Cost distribution across namespaces based on resource allocation</CardDescription>
            </CardHeader>
            <CardContent>
              {costByNamespaceData.length > 0 ? (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={costByNamespaceData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        type="number"
                        tickFormatter={(value) => formatCurrency(value)}
                        className="text-xs"
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        className="text-xs"
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCurrency(value), 'Hourly Cost']}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                        {costByNamespaceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                  No cost data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Node Costs */}
      {costAnalytics?.nodeCosts && costAnalytics.nodeCosts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              Node Costs
            </CardTitle>
            <CardDescription>Hourly costs per node</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Node</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">CPU Cost/hr</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">RAM Cost/hr</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">GPU Cost/hr</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total/hr</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">GPUs</th>
                  </tr>
                </thead>
                <tbody>
                  {costAnalytics.nodeCosts.map((node) => (
                    <tr key={node.node} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-medium">{node.node}</td>
                      <td className="text-right py-3 px-4 font-mono text-blue-600 dark:text-blue-400">
                        {formatCurrency(node.cpuHourlyCost)}
                      </td>
                      <td className="text-right py-3 px-4 font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(node.ramHourlyCost)}
                      </td>
                      <td className="text-right py-3 px-4 font-mono text-amber-600 dark:text-amber-400">
                        {formatCurrency(node.gpuHourlyCost)}
                      </td>
                      <td className="text-right py-3 px-4 font-mono font-bold">
                        {formatCurrency(node.totalHourlyCost)}
                      </td>
                      <td className="text-right py-3 px-4">
                        <Badge variant="outline">{node.gpuCount}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
