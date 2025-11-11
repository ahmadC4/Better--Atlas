import { useId } from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type AdminSectionTabValue = 'system' | 'user';

export interface AdminSectionTabsProps {
  value: AdminSectionTabValue;
  onValueChange: (value: AdminSectionTabValue) => void;
  systemDisabled?: boolean;
  userDisabled?: boolean;
  className?: string;
  label?: string;
}

interface TriggerDefinition {
  value: AdminSectionTabValue;
  disabled: boolean;
  onClick: () => void;
}

export const getAdminSectionTabTriggers = ({
  onValueChange,
  systemDisabled = false,
  userDisabled = false,
}: Pick<AdminSectionTabsProps, 'onValueChange' | 'systemDisabled' | 'userDisabled'>): {
  system: TriggerDefinition;
  user: TriggerDefinition;
} => {
  const createHandler = (value: AdminSectionTabValue, disabled: boolean) => () => {
    if (!disabled) {
      onValueChange(value);
    }
  };

  return {
    system: {
      value: 'system',
      disabled: systemDisabled,
      onClick: createHandler('system', systemDisabled),
    },
    user: {
      value: 'user',
      disabled: userDisabled,
      onClick: createHandler('user', userDisabled),
    },
  };
};

export function AdminSectionTabs({
  value,
  onValueChange,
  systemDisabled = false,
  userDisabled = false,
  className,
  label = 'Admin sections',
}: AdminSectionTabsProps) {
  const labelId = useId();
  const triggers = getAdminSectionTabTriggers({ onValueChange, systemDisabled, userDisabled });

  return (
    <div className={cn('w-full', className)} data-active-tab={value}>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <TabsList
        aria-labelledby={labelId}
        className="grid w-full grid-cols-2 gap-1 bg-muted/60 p-1 sm:w-auto sm:grid-cols-none sm:rounded-full"
      >
        <TabsTrigger
          value={triggers.system.value}
          disabled={triggers.system.disabled}
          onClick={triggers.system.onClick}
          className="rounded-md text-sm font-medium transition-colors data-[state=active]:bg-background data-[state=active]:shadow-sm sm:rounded-full"
        >
          System
        </TabsTrigger>
        <TabsTrigger
          value={triggers.user.value}
          disabled={triggers.user.disabled}
          onClick={triggers.user.onClick}
          className="rounded-md text-sm font-medium transition-colors data-[state=active]:bg-background data-[state=active]:shadow-sm sm:rounded-full"
        >
          User
        </TabsTrigger>
      </TabsList>
    </div>
  );
}
