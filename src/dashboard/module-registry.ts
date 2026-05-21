import { Circle } from 'lucide-react';
import { createElement, type ReactNode } from 'react';
import {
  DashboardNavSection,
  type DashboardServiceStatus,
  type DashboardServiceStatusResponse
} from '@/proto/dashboard';
import type { DashboardModuleManifest, DashboardModuleRegistration } from './module-contract';

export type { DashboardModuleManifest, DashboardModuleRegistration } from './module-contract';
export type { DashboardServiceStatus, DashboardServiceStatusResponse } from '@/proto/dashboard';

export type DashboardNavItem = {
  key: string;
  label: string;
  icon: ReactNode;
  section: 'main' | 'lab';
  requiredServices: string[];
  order: number;
};

export type ServiceStatusMap = Record<string, DashboardServiceStatus>;

const manifestModules = import.meta.glob<{
  default?: DashboardModuleManifest | DashboardModuleRegistration;
  manifest?: DashboardModuleManifest | DashboardModuleRegistration;
  registration?: DashboardModuleRegistration;
}>(
  './modules/*/manifest.tsx',
  { eager: true }
);

export const dashboardModuleRegistrations = Object.values(manifestModules)
  .map((module) => normalizeRegistration(module.registration || module.default || module.manifest))
  .filter((registration): registration is DashboardModuleRegistration => !!registration?.manifest?.id)
  .sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));

export const dashboardModuleViews = Object.assign(
  {},
  ...dashboardModuleRegistrations.map((registration) => registration.views || {})
);

export function buildDashboardNavItems(registrations: DashboardModuleRegistration[]): DashboardNavItem[] {
  return registrations
    .flatMap((registration) => (registration.manifest.nav || []).map((entry) => ({ entry, registration })))
    .map((entry, index) => ({
      key: entry.entry.key,
      label: entry.entry.label,
      icon: entry.registration.icons?.[entry.entry.icon] || createElement(Circle, { size: 17 }),
      section: dashboardNavSection(entry.entry.section),
      requiredServices: entry.entry.required_services || [],
      order: entry.entry.order || index
    }))
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
}

export function indexServiceStatus(response: DashboardServiceStatusResponse | null): ServiceStatusMap {
  return Object.fromEntries((response?.services || []).map((service) => [service.name, service]));
}

function normalizeRegistration(
  value: DashboardModuleManifest | DashboardModuleRegistration | undefined
): DashboardModuleRegistration | null {
  if (!value) return null;
  if ('manifest' in value) return value;
  return { manifest: value };
}

function dashboardNavSection(section: DashboardNavSection | undefined): 'main' | 'lab' {
  return section === DashboardNavSection.DASHBOARD_NAV_SECTION_LAB ? 'lab' : 'main';
}
