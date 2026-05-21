import React from 'react';
import { Activity } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export function AppDrawer({ open, title, description, icon, size = 'default', className, bodyClassName, onOpenChange, children }: {
  open: boolean;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  size?: 'default' | 'wide';
  className?: string;
  bodyClassName?: string;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
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

export function DetailDrawer({ open, title, icon, onClose, children }: {
  open: boolean;
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <AppDrawer open={open} title={title} icon={icon} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}>
      {children}
    </AppDrawer>
  );
}
