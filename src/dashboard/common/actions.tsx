import React, { type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RowActionDescriptor } from '../types';
import { buttonHint } from '../utils';

export function RecordActionButtons({ actions }: { actions: RowActionDescriptor[] }) {
  return (
    <>
      {actions.map((action) => (
        <IconActionButton
          key={action.id || action.label}
          className={action.className}
          label={action.label}
          icon={action.icon}
          kind={action.kind}
          disabled={action.disabled}
          onClick={() => action.onClick()}
        />
      ))}
    </>
  );
}

export type ActionButtonDescriptor = {
  id?: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  visible?: boolean;
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
  type?: ComponentProps<typeof Button>['type'];
  form?: string;
  className?: string;
  onClick?: () => void;
};

export function ActionButtonGroup({ actions, className }: {
  actions: ActionButtonDescriptor[];
  className?: string;
}) {
  const visibleActions = actions.filter((action) => action.visible !== false);
  if (visibleActions.length === 0) return null;
  return (
    <div className={className}>
      {visibleActions.map((action) => (
        <Button
          key={action.id ?? action.label}
          className={action.className}
          variant={action.variant}
          size={action.size}
          type={action.type}
          form={action.form}
          {...buttonHint(action.hint ?? action.label)}
          disabled={action.disabled}
          onClick={action.onClick ? () => action.onClick?.() : undefined}
        >
          {action.icon}
          {action.label}
        </Button>
      ))}
    </div>
  );
}

export function IconActionButton({ label, icon, disabled, kind = 'secondary', className, onClick }: {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  kind?: 'primary' | 'secondary' | 'danger';
  className?: string;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <Button
      className={cn('iconActionButton', kind === 'primary' && 'primaryIconAction', kind === 'danger' && 'dangerIconAction', className)}
      {...buttonHint(label)}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
    >
      {icon}
    </Button>
  );
}
