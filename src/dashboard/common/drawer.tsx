import React from 'react';
import { Activity } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type AppDrawerProps = {
  open: boolean;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  size?: 'default' | 'wide';
  className?: string;
  bodyClassName?: string;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function AppDrawer({
  open,
  title,
  description,
  icon,
  size = 'default',
  className,
  bodyClassName,
  onOpenChange,
  children,
}: AppDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn('appDrawer', className)} data-size={size} side="right" showCloseButton>
        <SheetHeader className="appDrawerHeader">
          <SheetTitle className="appDrawerTitle">{icon || <Activity size={16} />}{title}</SheetTitle>
          <SheetDescription className={description ? '' : 'sr-only'}>{description || `${title}明细面板`}</SheetDescription>
        </SheetHeader>
        <div className={cn('appDrawerBody', bodyClassName)}>{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export type DetailDrawerProps = Omit<AppDrawerProps, 'description' | 'onOpenChange'> & {
  description?: string;
  onClose: () => void;
};

export function DetailDrawer({ onClose, ...props }: DetailDrawerProps) {
  return (
    <AppDrawer
      {...props}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    />
  );
}
