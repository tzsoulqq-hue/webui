import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { DashboardSidebar } from './navigation';
import { DashboardContent } from './app-content';
import {
  buildDashboardNavItems,
  dashboardModuleRegistrations,
  indexServiceStatus,
  type DashboardServiceStatusResponse,
  type ServiceStatusMap
} from './module-registry';
import { api } from './http';

export default function App() {
  const navItems = useMemo(() => buildDashboardNavItems(dashboardModuleRegistrations), []);
  const [activeView, setActiveView] = useState(() => navItems[0]?.key || '');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('byte-v-forge-sidebar') === 'collapsed');
  const serviceStatusQuery = useQuery({
    queryKey: ['dashboard', 'service-status'],
    queryFn: () => api<DashboardServiceStatusResponse>('/api/service-status'),
    refetchInterval: 15000
  });
  const serviceStatus = useMemo<ServiceStatusMap>(() => indexServiceStatus(serviceStatusQuery.data || null), [serviceStatusQuery.data]);

  useEffect(() => {
    localStorage.setItem('byte-v-forge-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
  }, [sidebarCollapsed]);

  return (
    <div className="shell">
      <SidebarProvider open={!sidebarCollapsed} onOpenChange={(open) => setSidebarCollapsed(!open)}>
        <DashboardSidebar
          items={navItems}
          activeView={activeView}
          serviceStatus={serviceStatus}
          onSelect={setActiveView}
        />
        <SidebarInset className="contentPane">
          <DashboardContent activeView={activeView} />
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
