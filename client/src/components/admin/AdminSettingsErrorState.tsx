import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AdminSettingsErrorStateProps {
  title: string;
  description: string;
  onRetry: () => void | Promise<unknown>;
  testId?: string;
}

export function AdminSettingsErrorState({
  title,
  description,
  onRetry,
  testId,
}: AdminSettingsErrorStateProps) {
  const resolvedTestId = testId ?? 'admin-settings-error-state';

  return (
    <div
      className="flex h-screen flex-1 items-center justify-center px-4"
      data-testid={resolvedTestId}
    >
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="rounded-full bg-destructive/10 p-3 text-destructive">
          <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            void onRetry();
          }}
          data-testid={`${resolvedTestId}-retry`}
        >
          Retry
        </Button>
      </div>
    </div>
  );
}

