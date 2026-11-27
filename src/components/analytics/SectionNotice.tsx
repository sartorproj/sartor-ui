import { AlertCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SectionNoticeProps {
  tone: 'info' | 'error'
  children: React.ReactNode
  onRetry?: () => void
}

/** A one-line notice shown in place of an analytics section. */
export function SectionNotice({ tone, children, onRetry }: SectionNoticeProps) {
  const Icon = tone === 'error' ? AlertCircle : Info
  return (
    <div
      role="status"
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
        tone === 'error'
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
          : 'border-border bg-muted/40 text-muted-foreground'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}
