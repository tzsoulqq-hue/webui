import React from 'react';
import { cn } from '@/lib/utils';
import { EmptyBlock } from './empty';

export function RecordList({ children, emptyText, className }: {
  children: React.ReactNode;
  emptyText: string;
  className?: string;
}) {
  const hasChildren = React.Children.count(children) > 0;
  return <div className={cn('recordList', className)}>{hasChildren ? children : <EmptyBlock text={emptyText} />}</div>;
}

export function RecordCard({ selected, onClick, className, children }: {
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onClick();
  }

  return (
    <div
      className={cn('recordCard', selected && 'selected', onClick && 'clickable', className)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

export function RecordMain({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('recordMain', className)}>{children}</div>;
}

export function RecordTop({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('recordTop', className)}>{children}</div>;
}

export function RecordIdentity({ icon, title, subtitle, titleClassName }: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  titleClassName?: string;
}) {
  return (
    <div className="recordIdentity">
      {icon && <span className="recordIcon">{icon}</span>}
      <div>
        <strong className={cn('recordTitle', titleClassName)}>{title}</strong>
        {subtitle && <span className="recordSubtitle">{subtitle}</span>}
      </div>
    </div>
  );
}

export function RecordMeta({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('recordMeta', className)}>{children}</div>;
}

export function RecordField({ label, value, children, mono, title, className }: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  mono?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn('recordField', mono && 'mono', className)} title={title}>
      <span>{label}</span>
      <div className="recordFieldValue">{children ?? value ?? '-'}</div>
    </div>
  );
}

export function RecordActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('recordActions', className)}>{children}</div>;
}
