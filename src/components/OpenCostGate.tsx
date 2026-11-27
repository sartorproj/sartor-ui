import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { OpenCostHealthStatus } from '@/lib/api';
import { openCostProblem, type QueryView } from '@/lib/analytics';

/** Renders children only when OpenCost is enabled and connected; otherwise explains why not. */
export function OpenCostGate({ health, children }: { health: QueryView<OpenCostHealthStatus>; children: ReactNode }) {
  if (health.isLoading && !health.data) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Checking OpenCost…</p>;
  }
  const problem = openCostProblem(health);
  if (!problem) return <>{children}</>;
  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-800 dark:text-amber-200">OpenCost Integration Required</h3>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">{problem}</p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              The cluster resource and cost panels need OpenCost; the sections above do not.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
