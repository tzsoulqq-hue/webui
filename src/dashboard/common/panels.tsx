import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function PanelHeader({ title, icon, children }: { title: string; icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="panelHeader">
      <div><span>{icon}</span>{title}</div>
      {children}
    </div>
  );
}

export function PanelNotice({ kind, title, text }: { kind: 'info' | 'error'; title: string; text: string }) {
  return (
    <Alert className={`panelNotice ${kind}`} variant={kind === 'error' ? 'destructive' : 'default'} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'error' ? <AlertTriangle size={16} /> : <Clock size={16} />}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
