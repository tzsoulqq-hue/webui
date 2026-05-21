import type { ReactNode } from 'react';
import { DashboardNavSection, type DashboardModuleManifest } from '@/proto/dashboard';
import type { DashboardModuleViewProps } from './dashboard-context';

export { DashboardNavSection };
export type { DashboardModuleManifest } from '@/proto/dashboard';

export type DashboardModuleRegistration = {
  manifest: DashboardModuleManifest;
  icons?: Record<string, ReactNode>;
  views?: Record<string, (props: DashboardModuleViewProps) => ReactNode>;
};
