import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import type { DashboardStats, AtelierSummary } from '../lib/api';
import { 
  Scissors, 
  GitBranch, 
  Pause, 
  CheckCircle, 
  AlertCircle,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiClient.getDashboardStats(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: atelier, isLoading: atelierLoading } = useQuery<AtelierSummary>({
    queryKey: ['atelier'],
    queryFn: () => apiClient.getAtelier(),
  });

  if (statsLoading || atelierLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Tailorings',
      value: stats?.totalTailorings || 0,
      icon: Scissors,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900',
    },
    {
      title: 'Active Tailorings',
      value: stats?.activeTailorings || 0,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900',
    },
    {
      title: 'Paused Tailorings',
      value: stats?.pausedTailorings || 0,
      icon: Pause,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900',
    },
    {
      title: 'Open PRs',
      value: stats?.openPRs || 0,
      icon: GitBranch,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100 dark:bg-indigo-900',
    },
    {
      title: 'Fit Profiles',
      value: stats?.totalFitProfiles || 0,
      icon: Sparkles,
      color: 'text-pink-600',
      bgColor: 'bg-pink-100 dark:bg-pink-900',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Overview of your Sartor resource optimization
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {stat.value}
                    </p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bgColor}`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Atelier Status */}
      {atelier && (
        <Card>
          <CardHeader>
            <CardTitle>Atelier Configuration</CardTitle>
            <CardDescription>Connection status and configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium">
                  Prometheus
                </span>
                <div className="flex items-center">
                  {atelier.prometheusConnected ? (
                    <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      Disconnected
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium">
                  Git Provider
                </span>
                <div className="flex items-center">
                  {atelier.gitProviderConnected ? (
                    <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      Disconnected
                    </Badge>
                  )}
                </div>
              </div>
              {atelier.argoCDEnabled && (
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <span className="text-sm font-medium">
                    ArgoCD
                  </span>
                  <div className="flex items-center">
                    {atelier.argoCDConnected ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        Disconnected
                      </Badge>
                    )}
                  </div>
                </div>
              )}
              {atelier.openCostEnabled && (
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <span className="text-sm font-medium">
                    OpenCost
                  </span>
                  <div className="flex items-center">
                    {atelier.openCostConnected ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        Disconnected
                      </Badge>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium">
                  Managed Tailorings
                </span>
                <span className="text-sm font-semibold">
                  {atelier.managedTailorings}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Savings Estimate */}
      {stats?.totalSavings && (
        <Card className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-90">Estimated Monthly Savings</p>
                <p className="mt-2 text-3xl font-bold">{stats.totalSavings}</p>
              </div>
              <TrendingUp className="w-12 h-12 opacity-80" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
