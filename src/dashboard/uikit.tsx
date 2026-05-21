import React from 'react';
import { Button } from '@/components/ui/button';
import { TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function WorkspaceToolbar({ title, meta, tabs, actions, className }: {
  title?: React.ReactNode;
  meta?: React.ReactNode;
  tabs?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-10 items-center justify-between gap-3 border-b border-border/70 px-3 py-2', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {title && <div className="min-w-0 text-sm font-semibold text-foreground">{title}</div>}
        {tabs}
        {meta && <div className="shrink-0 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function ToolbarIconButton({ label, icon, disabled, tone = 'default', onClick }: {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'danger';
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) {
  const variant = tone === 'danger' ? 'destructive' : tone === 'primary' ? 'default' : 'outline';
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={label}
            title={label}
            variant={variant}
            size="icon-sm"
            disabled={disabled}
            onClick={onClick}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export type ToolbarActionDescriptor = {
  id?: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'danger';
  visible?: boolean;
  onClick: () => void;
};

export function ToolbarActionButtons({ actions }: { actions: ToolbarActionDescriptor[] }) {
  const visibleActions = actions.filter((action) => action.visible !== false);
  if (visibleActions.length === 0) return null;
  return (
    <>
      {visibleActions.map((action, index) => (
        <ToolbarIconButton
          key={action.id ?? `${action.label}-${index}`}
          label={action.label}
          icon={action.icon}
          disabled={action.disabled}
          tone={action.tone}
          onClick={() => action.onClick()}
        />
      ))}
    </>
  );
}

export type SegmentedControlOption<TValue extends string = string> = {
  value: TValue;
  label: React.ReactNode;
  disabled?: boolean;
};

export function SegmentedControl<TValue extends string>({ value, options, onChange, className }: {
  value: TValue;
  options: readonly SegmentedControlOption<TValue>[];
  onChange: (value: TValue) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-2', className)}>
      {options.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? 'default' : 'outline'}
          size="sm"
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function ClickableTableRow({ selected, children, onClick }: {
  selected?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  function onKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onClick();
  }

  return (
    <TableRow
      tabIndex={0}
      data-state={selected ? 'selected' : undefined}
      className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </TableRow>
  );
}
