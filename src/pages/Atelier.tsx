import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import type { AtelierSummary } from '../lib/api';
import { Settings, CheckCircle, XCircle, Database, GitBranch, Activity, DollarSign } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Atelier() {
  const { data: atelier, isLoading } = useQuery<AtelierSummary>({
    queryKey: ['atelier'],
    queryFn: () => apiClient.getAtelier(),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!atelier) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <Settings className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <CardTitle className="mb-2">No Atelier Found</CardTitle>
          <CardDescription>
            Create an Atelier resource to configure Sartor
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Atelier Configuration</h1>
        <p className="mt-2 text-muted-foreground">
          Global configuration and connection status
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Prometheus Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center">
              <Database className="w-6 h-6 text-primary mr-3" />
              <CardTitle>Prometheus</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                URL
              </label>
              <p className="mt-1 text-sm">
                {atelier.prometheusUrl || 'Not configured'}
              </p>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">
                Connection Status
              </span>
              {atelier.prometheusConnected ? (
                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="w-4 h-4 mr-1" />
                  Disconnected
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Git Provider Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center">
              <GitBranch className="w-6 h-6 text-primary mr-3" />
              <CardTitle>Git Provider</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Type
              </label>
              <p className="mt-1 text-sm capitalize">
                {atelier.gitProviderType || 'Not configured'}
              </p>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">
                Connection Status
              </span>
              {atelier.gitProviderConnected ? (
                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="w-4 h-4 mr-1" />
                  Disconnected
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ArgoCD Configuration */}
        {atelier.argoCDEnabled && (
          <Card>
            <CardHeader>
              <div className="flex items-center">
                <Activity className="w-6 h-6 text-primary mr-3" />
                <CardTitle>ArgoCD</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium">
                  Enabled
                </span>
                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
                  Yes
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium">
                  Connection Status
                </span>
                {atelier.argoCDConnected ? (
                  <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="w-4 h-4 mr-1" />
                    Disconnected
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* OpenCost Configuration */}
        {atelier.openCostEnabled && (
          <Card>
            <CardHeader>
              <div className="flex items-center">
                <DollarSign className="w-6 h-6 text-primary mr-3" />
                <CardTitle>OpenCost</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {atelier.openCostUrl && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    URL
                  </label>
                  <p className="mt-1 text-sm">
                    {atelier.openCostUrl}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium">
                  Connection Status
                </span>
                {atelier.openCostConnected ? (
                  <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="w-4 h-4 mr-1" />
                    Disconnected
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Statistics */}
        <Card>
          <CardHeader>
            <div className="flex items-center">
              <Activity className="w-6 h-6 text-primary mr-3" />
              <CardTitle>Statistics</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">
                Managed Tailorings
              </span>
              <span className="text-lg font-semibold">
                {atelier.managedTailorings}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">
                Batch Mode
              </span>
              <Badge variant={atelier.batchMode ? "default" : "secondary"}>
                {atelier.batchMode ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
