import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../lib/api';
import type { FitProfile } from '../lib/api';
import { Sparkles, CheckCircle, XCircle } from 'lucide-react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';

export default function FitProfiles() {
  const navigate = useNavigate();
  const { data: fitProfiles, isLoading } = useQuery<FitProfile[]>({
    queryKey: ['fitprofiles'],
    queryFn: () => apiClient.listFitProfiles(),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const getStatusBadge = (profile: FitProfile) => {
    const isValid = profile.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True') || 
                   (profile.status?.parametersValid && profile.status?.strategyValid);
    
    if (isValid) {
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
          <CheckCircle className="w-3 h-3 mr-1" />
          Valid
        </Badge>
      );
    }
    return (
      <Badge variant="destructive">
        <XCircle className="w-3 h-3 mr-1" />
        Invalid
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Fit Profiles</h1>
        <p className="mt-2 text-muted-foreground">
          Manage optimization profiles with strategy-specific configurations
        </p>
      </div>

      {fitProfiles && fitProfiles.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Sparkles className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <CardTitle className="mb-2">No Fit Profiles Found</CardTitle>
            <CardDescription>
              Create a Fit Profile to define custom optimization strategies
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <DataTable
          data={fitProfiles || []}
          columns={[
            {
              key: 'metadata.name',
              label: 'Name',
              sortable: true,
              render: (p) => (
                <div>
                  <div className="text-sm font-medium">
                    {p.spec.displayName || p.metadata.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {p.metadata.namespace}
                  </div>
                </div>
              ),
            },
            {
              key: 'metadata.namespace',
              label: 'Namespace',
              sortable: true,
              filterable: true,
              getFilterValue: (p) => p.metadata.namespace,
              render: (p) => <span className="text-sm">{p.metadata.namespace}</span>,
            },
            {
              key: 'spec.strategy',
              label: 'Strategy',
              sortable: true,
              filterable: true,
              getFilterValue: (p) => p.spec.strategy,
              render: (p) => (
                <Badge variant="outline" className="font-mono">
                  {p.spec.strategy}
                </Badge>
              ),
            },
            {
              key: 'spec.description',
              label: 'Description',
              sortable: false,
              render: (p) => (
                <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
                  {p.spec.description || '-'}
                </span>
              ),
            },
            {
              key: 'status.usageCount',
              label: 'Usage',
              sortable: true,
              render: (p) => (
                <span className="text-sm">
                  {p.status?.usageCount || 0} Tailoring{(p.status?.usageCount || 0) !== 1 ? 's' : ''}
                </span>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              sortable: true,
              render: (p) => getStatusBadge(p),
            },
          ] as TableColumn<FitProfile>[]}
          searchPlaceholder="Search fit profiles by name, strategy, description..."
          defaultSort={{ key: 'metadata.name', direction: 'asc' }}
          onRowClick={(p) => navigate(`/fitprofiles/${p.metadata.namespace}/${p.metadata.name}`)}
        />
      )}
    </div>
  );
}
