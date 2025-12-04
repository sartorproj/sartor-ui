import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import type { OpenCostAllocation, OpenCostSummary } from '../lib/api';
import {
  DollarSign,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  Gauge,
  AlertCircle,
  CheckCircle,
  TrendingDown,
  Layers,
  Server,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
} from 'recharts';

const TIME_WINDOWS = [
  { value: '1d', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'lastweek', label: 'Last Week' },
  { value: 'lastmonth', label: 'Last Month' },
];

const COST_COLORS = {
  cpu: '#3b82f6',      // blue
  ram: '#10b981',      // emerald
  gpu: '#f59e0b',      // amber
  pv: '#8b5cf6',       // violet
  network: '#ec4899',  // pink
  shared: '#6b7280',   // gray
  loadBalancer: '#14b8a6', // teal
};

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(2)}k`;
  }
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function Costs() {
  const [timeWindow, setTimeWindow] = useState('7d');
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);

  // Fetch OpenCost health status
  const { data: healthStatus, isLoading: healthLoading } = useQuery({
    queryKey: ['opencost-health'],
    queryFn: () => apiClient.getOpenCostHealth(),
    refetchInterval: 60000,
  });

  // Fetch cost summary
  const { data: summary } = useQuery<OpenCostSummary>({
    queryKey: ['opencost-summary', timeWindow],
    queryFn: () => apiClient.getOpenCostSummary(timeWindow),
    enabled: healthStatus?.connected ?? false,
    refetchInterval: 60000,
  });

  // Fetch namespace costs
  const { data: namespaceCosts } = useQuery<OpenCostAllocation[]>({
    queryKey: ['opencost-namespaces', timeWindow],
    queryFn: () => apiClient.getOpenCostNamespaceCosts(timeWindow),
    enabled: healthStatus?.connected ?? false,
    refetchInterval: 60000,
  });

  // Fetch controller costs
  const { data: controllerCosts } = useQuery<OpenCostAllocation[]>({
    queryKey: ['opencost-controllers', timeWindow, selectedNamespace],
    queryFn: () => apiClient.getOpenCostControllerCosts(timeWindow, selectedNamespace || undefined),
    enabled: healthStatus?.connected ?? false,
    refetchInterval: 60000,
  });

  // If OpenCost is not enabled/connected, show a message
  if (!healthLoading && (!healthStatus?.enabled || !healthStatus?.connected)) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cost Analysis</h1>
          <p className="mt-2 text-muted-foreground">
            Kubernetes cost visibility powered by OpenCost
          </p>
        </div>

        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                  OpenCost Integration Not Available
                </h3>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  {!healthStatus?.enabled
                    ? 'OpenCost integration is not enabled. Configure it in your Atelier resource.'
                    : `Unable to connect to OpenCost: ${healthStatus?.error || 'Unknown error'}`}
                </p>
                <div className="mt-4 text-sm text-amber-600 dark:text-amber-400">
                  <p className="font-medium">To enable OpenCost:</p>
                  <ol className="mt-2 list-decimal list-inside space-y-1">
                    <li>Install OpenCost in your cluster</li>
                    <li>Update your Atelier resource with OpenCost configuration</li>
                    <li>Set <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">spec.opencost.enabled: true</code></li>
                    <li>Set <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">spec.opencost.url</code> to your OpenCost service URL</li>
                  </ol>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Prepare chart data
  const costBreakdownData = summary
    ? [
        { name: 'CPU', value: summary.cpuCost, color: COST_COLORS.cpu },
        { name: 'Memory', value: summary.ramCost, color: COST_COLORS.ram },
        { name: 'GPU', value: summary.gpuCost, color: COST_COLORS.gpu },
        { name: 'Storage', value: summary.pvCost, color: COST_COLORS.pv },
        { name: 'Network', value: summary.networkCost, color: COST_COLORS.network },
        { name: 'Load Balancer', value: summary.loadBalancerCost, color: COST_COLORS.loadBalancer },
        { name: 'Shared', value: summary.sharedCost, color: COST_COLORS.shared },
      ].filter(item => item.value > 0)
    : [];

  const namespaceCostData = namespaceCosts
    ?.filter(ns => ns.totalCost > 0 && ns.name !== '__idle__')
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 10)
    .map(ns => ({
      name: ns.name || ns.namespace || 'Unknown',
      cost: ns.totalCost,
      cpuCost: ns.cpuCost,
      ramCost: ns.ramCost,
      efficiency: ns.totalEfficiency,
    })) || [];

  const statCards = [
    {
      title: 'Total Cost',
      value: formatCurrency(summary?.totalCost || 0),
      icon: DollarSign,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900',
    },
    {
      title: 'CPU Cost',
      value: formatCurrency(summary?.cpuCost || 0),
      icon: Cpu,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900',
      subtitle: `${formatPercent(summary?.cpuEfficiency || 0)} efficiency`,
    },
    {
      title: 'Memory Cost',
      value: formatCurrency(summary?.ramCost || 0),
      icon: MemoryStick,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900',
      subtitle: `${formatPercent(summary?.ramEfficiency || 0)} efficiency`,
    },
    {
      title: 'Storage Cost',
      value: formatCurrency(summary?.pvCost || 0),
      icon: HardDrive,
      color: 'text-violet-600',
      bgColor: 'bg-violet-100 dark:bg-violet-900',
    },
    {
      title: 'Network Cost',
      value: formatCurrency(summary?.networkCost || 0),
      icon: Network,
      color: 'text-pink-600',
      bgColor: 'bg-pink-100 dark:bg-pink-900',
    },
    {
      title: 'Overall Efficiency',
      value: formatPercent(summary?.efficiency || 0),
      icon: Gauge,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100 dark:bg-amber-900',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cost Analysis</h1>
          <p className="mt-2 text-muted-foreground">
            Kubernetes cost visibility powered by OpenCost
          </p>
        </div>

        <div className="flex items-center gap-4">
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
                OpenCost Connected
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3 mr-1" />
                Disconnected
              </>
            )}
          </Badge>

          <Select value={timeWindow} onValueChange={setTimeWindow}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select time window" />
            </SelectTrigger>
            <SelectContent>
              {TIME_WINDOWS.map(window => (
                <SelectItem key={window.value} value={window.value}>
                  {window.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map(stat => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-muted-foreground truncate">
                      {stat.title}
                    </p>
                    <p className="mt-1 text-2xl font-bold truncate">{stat.value}</p>
                    {stat.subtitle && (
                      <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
                    )}
                  </div>
                  <div className={`p-2.5 rounded-full ${stat.bgColor} flex-shrink-0 ml-2`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Breakdown Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Cost Breakdown by Type
            </CardTitle>
            <CardDescription>Distribution of costs across resource types</CardDescription>
          </CardHeader>
          <CardContent>
            {costBreakdownData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costBreakdownData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                      labelLine={false}
                    >
                      {costBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
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
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No cost data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Namespace Costs Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Top Namespaces by Cost
            </CardTitle>
            <CardDescription>Top 10 most expensive namespaces</CardDescription>
          </CardHeader>
          <CardContent>
            {namespaceCostData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={namespaceCostData} layout="vertical">
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
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name === 'cpuCost' ? 'CPU' : name === 'ramCost' ? 'Memory' : 'Total',
                      ]}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="cpuCost" stackId="a" fill={COST_COLORS.cpu} name="CPU" />
                    <Bar dataKey="ramCost" stackId="a" fill={COST_COLORS.ram} name="Memory" />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No namespace data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tables */}
      <Tabs defaultValue="namespaces" className="space-y-4">
        <TabsList>
          <TabsTrigger value="namespaces" className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Namespaces
          </TabsTrigger>
          <TabsTrigger value="workloads" className="flex items-center gap-2">
            <Server className="w-4 h-4" />
            Workloads
          </TabsTrigger>
        </TabsList>

        <TabsContent value="namespaces">
          <Card>
            <CardHeader>
              <CardTitle>Namespace Cost Details</CardTitle>
              <CardDescription>
                Detailed breakdown of costs per namespace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                        Namespace
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                        Total Cost
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                        CPU Cost
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                        Memory Cost
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                        Storage Cost
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                        Network Cost
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                        Efficiency
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {namespaceCosts
                      ?.filter(ns => ns.name !== '__idle__')
                      .sort((a, b) => b.totalCost - a.totalCost)
                      .map((ns, index) => (
                        <tr
                          key={ns.name || index}
                          className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <span className="font-medium">{ns.name || ns.namespace || 'Unknown'}</span>
                          </td>
                          <td className="text-right py-3 px-4 font-mono">
                            {formatCurrency(ns.totalCost)}
                          </td>
                          <td className="text-right py-3 px-4 font-mono text-blue-600 dark:text-blue-400">
                            {formatCurrency(ns.cpuCost)}
                          </td>
                          <td className="text-right py-3 px-4 font-mono text-green-600 dark:text-green-400">
                            {formatCurrency(ns.ramCost)}
                          </td>
                          <td className="text-right py-3 px-4 font-mono text-violet-600 dark:text-violet-400">
                            {formatCurrency(ns.pvCost)}
                          </td>
                          <td className="text-right py-3 px-4 font-mono text-pink-600 dark:text-pink-400">
                            {formatCurrency(ns.networkCost)}
                          </td>
                          <td className="text-right py-3 px-4">
                            <Badge
                              variant="outline"
                              className={
                                ns.totalEfficiency >= 0.7
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  : ns.totalEfficiency >= 0.4
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              }
                            >
                              {formatPercent(ns.totalEfficiency)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {(!namespaceCosts || namespaceCosts.length === 0) && (
                  <div className="py-8 text-center text-muted-foreground">
                    No namespace cost data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workloads">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Workload Cost Details</CardTitle>
                  <CardDescription>
                    Detailed breakdown of costs per workload (controller)
                  </CardDescription>
                </div>
                <Select
                  value={selectedNamespace || 'all'}
                  onValueChange={(v) => setSelectedNamespace(v === 'all' ? null : v)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by namespace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Namespaces</SelectItem>
                    {namespaceCosts
                      ?.filter(ns => ns.name !== '__idle__')
                      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                      .map(ns => (
                        <SelectItem key={ns.name} value={ns.name || ns.namespace || ''}>
                          {ns.name || ns.namespace}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                        Workload
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                        Namespace
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                        Kind
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                        Total Cost
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                        CPU Cost
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                        Memory Cost
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                        CPU Eff.
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                        RAM Eff.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {controllerCosts
                      ?.filter(ctrl => ctrl.name !== '__idle__')
                      .sort((a, b) => b.totalCost - a.totalCost)
                      .slice(0, 50)
                      .map((ctrl, index) => (
                        <tr
                          key={`${ctrl.namespace}-${ctrl.name}-${index}`}
                          className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <span className="font-medium">
                              {ctrl.name || ctrl.controller || 'Unknown'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline">{ctrl.namespace || 'N/A'}</Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-sm">
                            {ctrl.controllerKind || 'Unknown'}
                          </td>
                          <td className="text-right py-3 px-4 font-mono font-medium">
                            {formatCurrency(ctrl.totalCost)}
                          </td>
                          <td className="text-right py-3 px-4 font-mono text-blue-600 dark:text-blue-400">
                            {formatCurrency(ctrl.cpuCost)}
                          </td>
                          <td className="text-right py-3 px-4 font-mono text-green-600 dark:text-green-400">
                            {formatCurrency(ctrl.ramCost)}
                          </td>
                          <td className="text-right py-3 px-4">
                            <Badge
                              variant="outline"
                              className={
                                ctrl.cpuEfficiency >= 0.7
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  : ctrl.cpuEfficiency >= 0.4
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              }
                            >
                              {formatPercent(ctrl.cpuEfficiency)}
                            </Badge>
                          </td>
                          <td className="text-right py-3 px-4">
                            <Badge
                              variant="outline"
                              className={
                                ctrl.ramEfficiency >= 0.7
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  : ctrl.ramEfficiency >= 0.4
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              }
                            >
                              {formatPercent(ctrl.ramEfficiency)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {(!controllerCosts || controllerCosts.length === 0) && (
                  <div className="py-8 text-center text-muted-foreground">
                    No workload cost data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Efficiency Insights */}
      {summary && summary.efficiency < 0.5 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <TrendingDown className="w-6 h-6 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                  Resource Efficiency Alert
                </h3>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  Your overall resource efficiency is {formatPercent(summary.efficiency)}, which is below the recommended 50% threshold.
                  Consider using Sartor's Tailoring resources to optimize your workloads and reduce costs.
                </p>
                <div className="mt-4 flex gap-4 text-sm">
                  <div>
                    <span className="text-amber-600 dark:text-amber-400">CPU Efficiency:</span>{' '}
                    <span className="font-medium">{formatPercent(summary.cpuEfficiency)}</span>
                  </div>
                  <div>
                    <span className="text-amber-600 dark:text-amber-400">Memory Efficiency:</span>{' '}
                    <span className="font-medium">{formatPercent(summary.ramEfficiency)}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
