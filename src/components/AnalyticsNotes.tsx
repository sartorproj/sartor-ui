import type { ReactNode } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function UnavailableNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
      <Info className="w-4 h-4 shrink-0" />
      {children}
    </p>
  );
}

export function ErrorNote({ error, onRetry, what }: { error: unknown; onRetry?: () => void; what: string }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center text-sm">
      <p className="flex items-center gap-2 text-red-600 dark:text-red-400">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Could not load {what}: {message}
      </p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={() => onRetry()}>
          Retry
        </Button>
      )}
    </div>
  );
}
