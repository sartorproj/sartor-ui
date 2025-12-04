import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import type { TailoringSummary } from '../lib/api';
import { Scissors, Pause, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Tailorings() {
  const { data: tailorings, isLoading } = useQuery<TailoringSummary[]>({
    queryKey: ['tailorings'],
    queryFn: () => apiClient.listTailorings(),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const getStatusBadge = (tailoring: TailoringSummary) => {
    if (tailoring.paused) {
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700">
          <Pause className="w-3 h-3 mr-1" />
          Paused
        </Badge>
      );
    }
    if (tailoring.readyCondition === 'True') {
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
          <CheckCircle className="w-3 h-3 mr-1" />
          Ready
        </Badge>
      );
    }
    return (
      <Badge variant="destructive">
        <AlertCircle className="w-3 h-3 mr-1" />
        Not Ready
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tailorings</h1>
          <p className="mt-2 text-muted-foreground">
            Manage resource optimization for your workloads
          </p>
        </div>
      </div>

      {tailorings && tailorings.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Scissors className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <CardTitle className="mb-2">No Tailorings Found</CardTitle>
            <CardDescription>
              Create a Tailoring to start optimizing your workloads
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <DataTable
          data={tailorings || []}
          columns={[
            {
              key: 'name',
              label: 'Name',
              sortable: true,
              render: (t) => (
                <div>
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-sm text-muted-foreground">{t.namespace}</div>
                </div>
              ),
            },
            {
              key: 'namespace',
              label: 'Namespace',
              sortable: true,
              filterable: true,
              render: (t) => <span className="text-sm">{t.namespace}</span>,
            },
            {
              key: 'targetName',
              label: 'Target',
              sortable: true,
              filterable: true,
              render: (t) => (
                <div>
                  <div className="text-sm">{t.targetName}</div>
                  <div className="text-sm text-muted-foreground">{t.targetKind}</div>
                </div>
              ),
            },
            {
              key: 'fitProfile',
              label: 'Fit Profile',
              sortable: true,
              filterable: true,
              getFilterValue: (t) => t.fitProfile || t.intent || '',
              render: (t) => <span className="text-sm">{t.fitProfile || t.intent || '-'}</span>,
            },
            {
              key: 'readyCondition',
              label: 'Status',
              sortable: true,
              render: (t) => getStatusBadge(t),
            },
            {
              key: 'prState',
              label: 'PR Status',
              sortable: true,
              filterable: true,
              render: (t) => {
                if (!t.prState) return <span className="text-sm text-muted-foreground">-</span>;
                const stateColors: Record<string, string> = {
                  'open': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
                  'merged': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                  'closed': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
                };
                return (
                  <Badge variant="outline" className={stateColors[t.prState] || ''}>
                    {t.prState}
                  </Badge>
                );
              },
            },
            {
              key: 'prNumber',
              label: 'PR #',
              sortable: true,
              render: (t) => {
                if (!t.prNumber) return <span className="text-sm text-muted-foreground">-</span>;
                return (
                  <a
                    href={t.prUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    #{t.prNumber}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                );
              },
            },
            {
              key: 'containerCount',
              label: 'Containers',
              sortable: true,
              render: (t) => <span className="text-sm">{t.containerCount}</span>,
            },
            {
              key: 'lastAnalysis',
              label: 'Last Analysis',
              sortable: true,
              render: (t) => (
                <span className="text-sm text-muted-foreground">
                  {t.lastAnalysis
                    ? formatDistanceToNow(new Date(t.lastAnalysis), { addSuffix: true })
                    : 'Never'}
                </span>
              ),
            },
          ] as TableColumn<TailoringSummary>[]}
          searchPlaceholder="Search tailorings..."
          defaultSort={{ key: 'name', direction: 'asc' }}
          onRowClick={(t) => {
            window.location.href = `/tailorings/${t.namespace}/${t.name}`;
          }}
        />
      )}
    </div>
  );
}
