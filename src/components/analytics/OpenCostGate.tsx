import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { OpenCostHealthStatus } from '@/lib/api'

export interface OpenCostGateProps {
  health?: OpenCostHealthStatus
  isLoading?: boolean
  error?: Error | null
  onRetry?: () => void
  /** Rendered only while OpenCost is enabled and connected. */
  children: React.ReactNode
}

/** Shows its children when OpenCost is usable and the reason it is not otherwise. */
export function OpenCostGate({ health, isLoading, error, onRetry, children }: OpenCostGateProps) {
  if (health?.enabled && health.connected) return <>{children}</>
  if (isLoading && !health) {
    return <p className="text-sm text-muted-foreground">Checking OpenCost…</p>
  }
  let message: string
  if (error && !health) {
    message = `Could not check the OpenCost status: ${error.message || 'Unknown error'}`
  } else if (!health?.enabled) {
    message = 'OpenCost integration is not enabled. Configure it in your Atelier resource.'
  } else {
    message = `Unable to connect to OpenCost: ${health.error || 'Unknown error'}`
  }
  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-amber-800 dark:text-amber-200">OpenCost Integration Required</h3>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">{message}</p>
            <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">
              The cluster resource and cost panels need OpenCost; the sections above do not.
            </p>
          </div>
          {error && !health && onRetry && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
