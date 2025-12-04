import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../lib/api';
import type { FitProfile } from '../lib/api';
import { ArrowLeft, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function FitProfileDetail() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();

  const { data: fitProfile, isLoading, error } = useQuery<FitProfile>({
    queryKey: ['fitprofile', namespace, name],
    queryFn: () => apiClient.getFitProfile(namespace!, name!),
    enabled: !!namespace && !!name,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !fitProfile) {
    return (
      <div className="space-y-6">
        <Link to="/fitprofiles">
          <Button variant="ghost">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Fit Profiles
          </Button>
        </Link>
        <Card className="text-center py-12">
          <CardContent>
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <CardTitle className="mb-2">Fit Profile Not Found</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'The requested fit profile could not be found'}
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isValid = fitProfile.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True') ||
    (fitProfile.status?.parametersValid && fitProfile.status?.strategyValid);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/fitprofiles">
            <Button variant="ghost">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Fit Profiles
            </Button>
          </Link>
          <h1 className="text-3xl font-bold mt-4">
            {fitProfile.spec.displayName || fitProfile.metadata.name}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Namespace: {fitProfile.metadata.namespace}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isValid ? (
            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
              <CheckCircle className="w-4 h-4 mr-1" />
              Valid
            </Badge>
          ) : (
            <Badge variant="destructive">
              <XCircle className="w-4 h-4 mr-1" />
              Invalid
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              <div>
                <dt className="text-sm text-muted-foreground">Strategy</dt>
                <dd className="text-sm font-medium">{fitProfile.spec.strategy}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Priority</dt>
                <dd className="text-sm font-medium">{fitProfile.spec.priority ?? 'Default'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Usage Count</dt>
                <dd className="text-sm font-medium">{fitProfile.status?.usageCount ?? 0} Tailoring{fitProfile.status?.usageCount !== 1 ? 's' : ''}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              <div>
                <dt className="text-sm text-muted-foreground">Strategy Valid</dt>
                <dd className="text-sm font-medium">
                  {fitProfile.status?.strategyValid ? (
                    <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">Yes</Badge>
                  ) : (
                    <Badge variant="destructive">No</Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Parameters Valid</dt>
                <dd className="text-sm font-medium">
                  {fitProfile.status?.parametersValid ? (
                    <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">Yes</Badge>
                  ) : (
                    <Badge variant="destructive">No</Badge>
                  )}
                </dd>
              </div>
              {fitProfile.status?.lastValidated && (
                <div>
                  <dt className="text-sm text-muted-foreground">Last Validated</dt>
                  <dd className="text-sm font-medium">
                    {new Date(fitProfile.status.lastValidated).toLocaleString()}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      {fitProfile.spec.description && (
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{fitProfile.spec.description}</p>
          </CardContent>
        </Card>
      )}

      {fitProfile.spec.parameters && (
        <Card>
          <CardHeader>
            <CardTitle>Strategy Parameters</CardTitle>
            <CardDescription>Configuration parameters for the strategy</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              try {
                // Try to parse parameters - could be raw JSON string or object
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let params: any = fitProfile.spec.parameters;
                
                // If it's an object with a 'raw' property (RawExtension), parse it
                if (params && typeof params === 'object' && 'raw' in params && params.raw) {
                  params = JSON.parse(typeof params.raw === 'string' ? params.raw : String(params.raw));
                } else if (typeof params === 'string') {
                  // If it's a string, try to parse it
                  params = JSON.parse(params);
                }
                
                // If we successfully parsed it as an object, display it nicely in a grid
                if (params && typeof params === 'object' && !Array.isArray(params)) {
                  const entries = Object.entries(params);
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {entries.map(([key, value]) => (
                        <Card key={key}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">{key}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-sm text-muted-foreground">
                              {typeof value === 'object' && value !== null ? (
                                <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                                  {JSON.stringify(value, null, 2)}
                                </pre>
                              ) : (
                                <span className="font-mono break-all">{String(value)}</span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  );
                }
                
                // Fallback to raw JSON display
                return (
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                    {JSON.stringify(params, null, 2)}
                  </pre>
                );
              } catch {
                // If parsing fails, show raw value
                return (
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                    {JSON.stringify(fitProfile.spec.parameters, null, 2)}
                  </pre>
                );
              }
            })()}
          </CardContent>
        </Card>
      )}

      {fitProfile.status?.validationMessage && (
        <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <CardHeader>
            <CardTitle className="text-yellow-800 dark:text-yellow-200">Validation Message</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-yellow-800 dark:text-yellow-200">{fitProfile.status.validationMessage}</p>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
