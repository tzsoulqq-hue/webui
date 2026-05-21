import type { ReactNode } from 'react';

export type Toast = { kind: 'ok' | 'error'; text: string } | null;
export type DisplayLabelMap = Record<string, string>;
export type PanelState = { loading: boolean; error: string };
export type RowActionDescriptor = {
  id?: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  kind?: 'primary' | 'secondary' | 'danger';
  className?: string;
};
