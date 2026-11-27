import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router';
import { apiClient, ForecastUnavailableError, tailoringMetricsTarget } from '../lib/api';
import type { Tailoring, FitProfile, TailoringMetricsTarget } from '../lib/api';
import { ArrowLeft, Scissors, AlertCircle, CheckCircle, XCircle, Clock, ExternalLink, Activity } from 'lucide-react';
import { MetricsChart, type MetricsChartProps, type ResourceLine, type TimeSeriesDataPoint } from '@/components/MetricsChart';
import { hasPercentileBounds, percentileBounds, type PercentileBounds } from '@/lib/metricsChart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type TableColumn } from '@/components/DataTable';
import { formatMemory, parseCPU, parseMemory } from '@/lib/quantity';
import * as React from 'react';

const PERCENTILE_STRATEGY = 'percentile';

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

type ContainerResourceChartProps = Omit<MetricsChartProps, 'forecast'> & {
  target: TailoringMetricsTarget;
  containerName: string;
  timeRange: string;
};

/** A container's chart with an on-demand forecast for its current time range. */
function ContainerResourceChart({ target, containerName, timeRange, ...chartProps }: ContainerResourceChartProps) {
  const [forecastEnabled, setForecastEnabled] = React.useState(false);
  const { resourceType } = chartProps;
  const forecastQuery = useQuery({
    queryKey: ['prometheus-forecast', target.namespace, target.name, target.cluster, target.kind, containerName, resourceType, timeRange],
    queryFn: () =>
      apiClient.getPrometheusForecast(target.namespace, target.name, containerName, resourceType, timeRange, target),
    enabled: forecastEnabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <MetricsChart
      {...chartProps}
      defaultTimeRange={timeRange}
      forecast={{
        enabled: forecastEnabled,
        onToggle: setForecastEnabled,
        loading: forecastQuery.isLoading,
        data: forecastQuery.data,
        error: forecastQuery.error ? errorMessage(forecastQuery.error) : undefined,
        unavailable: forecastQuery.error instanceof ForecastUnavailableError,
      }}
    />
  );
}

export default function TailoringDetail() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const [cpuTimeRange, setCpuTimeRange] = React.useState('1h');
  const [memoryTimeRange, setMemoryTimeRange] = React.useState('1h');

  const { data: tailoring, isLoading, error } = useQuery<Tailoring>({
    queryKey: ['tailoring', namespace, name],
    queryFn: () => apiClient.getTailoring(namespace!, name!),
    enabled: !!namespace && !!name,
  });

  // Fetch FitProfile to get strategy parameters for lines
  const fitProfileName = tailoring?.spec?.fitProfileRef?.name;
  const fitProfileNamespace = tailoring?.spec?.fitProfileRef?.namespace || tailoring?.metadata?.namespace || 'default';
  const { data: fitProfile, error: fitProfileError } = useQuery<FitProfile>({
    queryKey: ['fitprofile', fitProfileNamespace, fitProfileName],
    queryFn: () => apiClient.getFitProfile(fitProfileNamespace, fitProfileName!),
    enabled: !!fitProfileName,
  });

  // Fetch time series metrics for all containers
  const containerNames = tailoring?.status.lastAnalysis?.containers?.map(c => c.name) || [];
  
  // CPU metrics query
  const { data: cpuMetricsData } = useQuery({
    queryKey: ['prometheus-cpu-metrics', namespace, name, containerNames.join(','), cpuTimeRange],
    queryFn: async () => {
      if (!tailoring || !containerNames.length) return {};
      const results: Record<string, Array<{ timestamp: number; value: number; pod?: string }>> = {};
      const target = tailoringMetricsTarget(tailoring);
      
      for (const containerName of containerNames) {
        try {
          const data = await apiClient.getPrometheusMetrics(
            target.namespace,
            target.name,
            containerName,
            'cpu',
            cpuTimeRange,
            target
          );
          results[containerName] = data;
        } catch (err) {
          console.error(`Failed to fetch CPU metrics for ${containerName}:`, err);
          results[containerName] = [];
        }
      }
      return results;
    },
    enabled: !!tailoring && containerNames.length > 0,
    refetchInterval: 60000,
  });

  // Memory metrics query
  const { data: memoryMetricsData } = useQuery({
    queryKey: ['prometheus-memory-metrics', namespace, name, containerNames.join(','), memoryTimeRange],
    queryFn: async () => {
      if (!tailoring || !containerNames.length) return {};
      const results: Record<string, Array<{ timestamp: number; value: number; pod?: string }>> = {};
      const target = tailoringMetricsTarget(tailoring);
      
      for (const containerName of containerNames) {
        try {
          const data = await apiClient.getPrometheusMetrics(
            target.namespace,
            target.name,
            containerName,
            'memory',
            memoryTimeRange,
            target
          );
          results[containerName] = data;
        } catch (err) {
          console.error(`Failed to fetch Memory metrics for ${containerName}:`, err);
          results[containerName] = [];
        }
      }
      return results;
    },
    enabled: !!tailoring && containerNames.length > 0,
    refetchInterval: 60000,
  });

  // Helper to get resource lines for charts based on container and FitProfile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getResourceLines = (container: any, resourceType: 'cpu' | 'memory'): ResourceLine[] => {
    const lines: ResourceLine[] = [];
    
    // Current request
    const currentRequest = resourceType === 'cpu'
      ? container.current?.requests?.cpu
      : container.current?.requests?.memory;
    if (currentRequest) {
      const value = resourceType === 'cpu' ? parseCPU(currentRequest) : parseMemory(currentRequest);
      if (value > 0) {
        lines.push({
          name: 'Current Request',
          value,
          color: 'hsl(45 90% 50%)',  // Yellow/gold
          type: 'request',
          dashed: true,
        });
      }
    }

    // Current limit
    const currentLimit = resourceType === 'cpu'
      ? container.current?.limits?.cpu
      : container.current?.limits?.memory;
    if (currentLimit) {
      const value = resourceType === 'cpu' ? parseCPU(currentLimit) : parseMemory(currentLimit);
      if (value > 0) {
        lines.push({
          name: 'Current Limit',
          value,
          color: 'hsl(0 70% 50%)',  // Red
          type: 'limit',
          dashed: true,
        });
      }
    }

    // Recommended request
    const recommendedRequest = resourceType === 'cpu'
      ? container.recommended?.requests?.cpu
      : container.recommended?.requests?.memory;
    if (recommendedRequest) {
      const value = resourceType === 'cpu' ? parseCPU(recommendedRequest) : parseMemory(recommendedRequest);
      if (value > 0) {
        lines.push({
          name: 'Recommended Request',
          value,
          color: 'hsl(160 60% 45%)',  // Teal
          type: 'recommended',
        });
      }
    }

    // Recommended limit
    const recommendedLimit = resourceType === 'cpu'
      ? container.recommended?.limits?.cpu
      : container.recommended?.limits?.memory;
    if (recommendedLimit) {
      const value = resourceType === 'cpu' ? parseCPU(recommendedLimit) : parseMemory(recommendedLimit);
      if (value > 0) {
        lines.push({
          name: 'Recommended Limit',
          value,
          color: 'hsl(280 65% 60%)',  // Purple
          type: 'recommended',
        });
      }
    }

    return lines;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !tailoring) {
    return (
      <div className="space-y-6">
        <Link to="/tailorings">
          <Button variant="ghost">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tailorings
          </Button>
        </Link>
        <Card className="text-center py-12">
          <CardContent>
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <CardTitle className="mb-2">Tailoring Not Found</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'The requested tailoring could not be found'}
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Prepare table data for recommendations
  const tableData = tailoring.status.lastAnalysis?.containers?.flatMap((container) => {
    const rows: Array<{
      container: string;
      resource: string;
      current: string;
      recommended: string;
    }> = [];
    
    if (container.current?.requests?.cpu || container.recommended?.requests?.cpu) {
      rows.push({
        container: container.name,
        resource: 'CPU Request',
        current: container.current?.requests?.cpu || '-',
        recommended: container.recommended?.requests?.cpu || '-',
      });
    }
    if (container.current?.requests?.memory || container.recommended?.requests?.memory) {
      rows.push({
        container: container.name,
        resource: 'Memory Request',
        current: formatMemory(container.current?.requests?.memory),
        recommended: formatMemory(container.recommended?.requests?.memory),
      });
    }
    if (container.current?.limits?.cpu || container.recommended?.limits?.cpu) {
      rows.push({
        container: container.name,
        resource: 'CPU Limit',
        current: container.current?.limits?.cpu || '-',
        recommended: container.recommended?.limits?.cpu || '-',
      });
    }
    if (container.current?.limits?.memory || container.recommended?.limits?.memory) {
      rows.push({
        container: container.name,
        resource: 'Memory Limit',
        current: formatMemory(container.current?.limits?.memory),
        recommended: formatMemory(container.recommended?.limits?.memory),
      });
    }
    
    return rows;
  }) || [];

  const metricsTarget = tailoringMetricsTarget(tailoring);
  const isPercentile = fitProfile?.spec?.strategy?.trim().toLowerCase() === PERCENTILE_STRATEGY;
  const boundsFor = (
    container: NonNullable<NonNullable<Tailoring['status']['lastAnalysis']>['containers']>[number],
    resourceType: 'cpu' | 'memory'
  ): { bounds?: PercentileBounds; error?: string } => {
    const bounds = percentileBounds(container, resourceType);
    if (!hasPercentileBounds(bounds)) return {};
    if (isPercentile) return { bounds };
    // Without the FitProfile the strategy is unknown, so say why the bounds are missing.
    if (fitProfileError) {
      return { error: `Observed percentile bounds unavailable: could not load FitProfile: ${errorMessage(fitProfileError)}` };
    }
    return {};
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/tailorings">
            <Button variant="ghost">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Tailorings
            </Button>
          </Link>
          <h1 className="text-3xl font-bold mt-4">{tailoring.metadata.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Namespace: {tailoring.metadata.namespace}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Target</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              <div>
                <dt className="text-sm text-muted-foreground">Kind</dt>
                <dd className="text-sm font-medium">{tailoring.spec.target.kind}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Name</dt>
                <dd className="text-sm font-medium">{tailoring.spec.target.name}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              <div>
                <dt className="text-sm text-muted-foreground">Fit Profile</dt>
                <dd className="text-sm font-medium">{tailoring.spec.fitProfileRef.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Paused</dt>
                <dd className="text-sm font-medium">{tailoring.spec.paused ? 'Yes' : 'No'}</dd>
              </div>
              {fitProfile?.spec?.strategy && (
                <div>
                  <dt className="text-sm text-muted-foreground">Strategy</dt>
                  <dd className="text-sm font-medium">{fitProfile.spec.strategy}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      {tailoring.status.lastAnalysis && tableData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
            <CardDescription>Current vs Recommended Resources</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              data={tableData}
              columns={[
                {
                  key: 'container',
                  label: 'Container',
                  sortable: true,
                },
                {
                  key: 'resource',
                  label: 'Resource',
                  sortable: true,
                },
                {
                  key: 'current',
                  label: 'Current',
                  sortable: true,
                },
                {
                  key: 'recommended',
                  label: 'Recommended',
                  sortable: true,
                  render: (row) => (
                    <span className="font-medium">{row.recommended}</span>
                  ),
                },
              ] as TableColumn<typeof tableData[0]>[]}
              searchPlaceholder="Search recommendations..."
            />
          </CardContent>
        </Card>
      )}

      {!tailoring.status.lastAnalysis && (
        <Card className="text-center py-12">
          <CardContent>
            <Scissors className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <CardTitle className="mb-2">No Analysis Available</CardTitle>
            <CardDescription>
              Recommendations will appear here once the controller has analyzed this workload.
            </CardDescription>
          </CardContent>
        </Card>
      )}

      {/* PR Status */}
      {tailoring.status.prState && (
        <Card>
          <CardHeader>
            <CardTitle>PR Status</CardTitle>
            <CardDescription>Git PR information for this tailoring</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              <div>
                <dt className="text-sm text-muted-foreground">PR State</dt>
                <dd className="text-sm font-medium">
                  {tailoring.status.prState === 'merged' && (
                    <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Merged
                    </Badge>
                  )}
                  {tailoring.status.prState === 'open' && (
                    <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-700">
                      <Clock className="w-3 h-3 mr-1" />
                      Open
                    </Badge>
                  )}
                  {tailoring.status.prState === 'closed' && (
                    <Badge variant="destructive">
                      <XCircle className="w-3 h-3 mr-1" />
                      Closed
                    </Badge>
                  )}
                  {!['merged', 'open', 'closed'].includes(tailoring.status.prState) && (
                    <Badge variant="outline">
                      {tailoring.status.prState}
                    </Badge>
                  )}
                </dd>
              </div>
              {tailoring.status.prUrl && (
                <div>
                  <dt className="text-sm text-muted-foreground">PR URL</dt>
                  <dd className="text-sm font-medium">
                    <a
                      href={tailoring.status.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View PR
                    </a>
                  </dd>
                </div>
              )}
              {tailoring.status.prNumber && (
                <div>
                  <dt className="text-sm text-muted-foreground">PR Number</dt>
                  <dd className="text-sm font-medium">#{tailoring.status.prNumber}</dd>
                </div>
              )}
              {tailoring.status.branchName && (
                <div>
                  <dt className="text-sm text-muted-foreground">Branch</dt>
                  <dd className="text-sm font-medium font-mono">{tailoring.status.branchName}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Resource Charts */}
      {tailoring.status.lastAnalysis && tailoring.status.lastAnalysis.containers && tailoring.status.lastAnalysis.containers.length > 0 && (
        <div className="space-y-8">
          {tailoring.status.lastAnalysis.containers.map((container) => {
            // Time series data (may be empty if Prometheus not connected)
            const cpuTimeSeries: TimeSeriesDataPoint[] = (cpuMetricsData?.[container.name] || []).map(p => ({
              timestamp: p.timestamp,
              value: p.value,
              pod: p.pod,
            }));

            const memoryTimeSeries: TimeSeriesDataPoint[] = (memoryMetricsData?.[container.name] || []).map(p => ({
              timestamp: p.timestamp,
              value: p.value,
              pod: p.pod,
            }));

            // Resource lines (always available from analysis)
            const cpuResourceLines = getResourceLines(container, 'cpu');
            const memoryResourceLines = getResourceLines(container, 'memory');
            const cpuBounds = boundsFor(container, 'cpu');
            const memoryBounds = boundsFor(container, 'memory');

            // Check if we have any data to show
            const hasCPUData = cpuResourceLines.length > 0 || hasPercentileBounds(cpuBounds.bounds);
            const hasMemoryData = memoryResourceLines.length > 0 || hasPercentileBounds(memoryBounds.bounds);
            const hasPrometheusData = cpuTimeSeries.length > 0 || memoryTimeSeries.length > 0;

            if (!hasCPUData && !hasMemoryData && !cpuBounds.error && !memoryBounds.error) return null;

            return (
              <div key={container.name} className="space-y-6">
                {/* Container header */}
                <div className="flex items-center gap-2 border-b pb-3">
                  <Activity className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="text-xl font-semibold">Container: {container.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {hasPrometheusData 
                        ? 'Live metrics from Prometheus' 
                        : 'Prometheus data not available - showing resource limits only'}
                    </p>
                  </div>
                </div>
                
                {/* Charts - one per row for better visibility */}
                <div className="space-y-6">
                  {/* CPU Chart */}
                  {(hasCPUData || cpuBounds.error) && (
                    <ContainerResourceChart
                      target={metricsTarget}
                      containerName={container.name}
                      timeRange={cpuTimeRange}
                      title="CPU Usage & Limits"
                      description={`CPU metrics for ${container.name}`}
                      timeSeriesData={cpuTimeSeries}
                      resourceLines={cpuResourceLines}
                      percentileBounds={cpuBounds.bounds}
                      percentileBoundsError={cpuBounds.error}
                      resourceType="cpu"
                      height={400}
                      showTimeRangeSelector={true}
                      onTimeRangeChange={setCpuTimeRange}
                      showPerPodToggle={cpuTimeSeries.length > 0}
                    />
                  )}

                  {/* Memory Chart */}
                  {(hasMemoryData || memoryBounds.error) && (
                    <ContainerResourceChart
                      target={metricsTarget}
                      containerName={container.name}
                      timeRange={memoryTimeRange}
                      title="Memory Usage & Limits"
                      description={`Memory metrics for ${container.name}`}
                      timeSeriesData={memoryTimeSeries}
                      resourceLines={memoryResourceLines}
                      percentileBounds={memoryBounds.bounds}
                      percentileBoundsError={memoryBounds.error}
                      resourceType="memory"
                      height={400}
                      showTimeRangeSelector={true}
                      onTimeRangeChange={setMemoryTimeRange}
                      showPerPodToggle={memoryTimeSeries.length > 0}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
