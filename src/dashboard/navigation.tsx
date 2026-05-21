import { Monitor, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar
} from '@/components/ui/sidebar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/components/theme-provider';
import { DashboardServiceStatusState } from '@/proto/dashboard';
import type { DashboardNavItem, ServiceStatusMap } from './module-registry';

export function DashboardSidebar({
  items,
  activeView,
  serviceStatus,
  onSelect
}: {
  items: DashboardNavItem[];
  activeView: string;
  serviceStatus: ServiceStatusMap;
  onSelect: (view: string) => void;
}) {
  const mainItems = items.filter((item) => item.section === 'main');
  const labItems = items.filter((item) => item.section === 'lab');

  return (
    <Sidebar collapsible="icon" aria-label="主导航">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarBrandItem />
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavGroup items={mainItems} activeView={activeView} serviceStatus={serviceStatus} onSelect={onSelect} />
      </SidebarContent>

      {labItems.length > 0 && (
        <SidebarFooter className="dashboardSidebarLabFooter">
          <SidebarSeparator />
          <NavGroup label="Lab" items={labItems} activeView={activeView} serviceStatus={serviceStatus} onSelect={onSelect} />
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}

function SidebarBrandItem() {
  const { state, toggleSidebar } = useSidebar();
  if (state === 'collapsed') {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton tooltip="展开侧栏" className="dashboardSidebarBrand collapsedBrand" onClick={toggleSidebar}>
          <PanelLeftOpen />
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <div className="dashboardSidebarBrandRow">
        <div className="dashboardSidebarBrandLabel">
          <img className="brandMark" src="/favicon.svg" alt="" />
        </div>
        <div className="dashboardSidebarBrandActions">
          <SidebarThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="收起侧栏"
                title="收起侧栏"
                className="sidebarBrandIconButton"
                onClick={toggleSidebar}
              >
                <PanelLeftClose />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">收起侧栏</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </SidebarMenuItem>
  );
}

function SidebarThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <ToggleGroup
      type="single"
      value={theme}
      variant="outline"
      size="sm"
      spacing={0}
      aria-label="主题切换"
      onValueChange={(value) => {
        if (value === 'light' || value === 'dark' || value === 'system') setTheme(value);
      }}
    >
      <ThemeToggleItem value="system" label="系统" icon={<Monitor />} />
      <ThemeToggleItem value="light" label="亮色" icon={<Sun />} />
      <ThemeToggleItem value="dark" label="暗色" icon={<Moon />} />
    </ToggleGroup>
  );
}

function ThemeToggleItem({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToggleGroupItem value={value} aria-label={label} title={label} className="themeToggleButton">
          {icon}
        </ToggleGroupItem>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavGroup({
  label,
  items,
  activeView,
  serviceStatus = {},
  onSelect
}: {
  label?: string;
  items: DashboardNavItem[];
  activeView: string;
  serviceStatus?: ServiceStatusMap;
  onSelect: (view: string) => void;
}) {
  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const hasStatus = Object.keys(serviceStatus).length > 0;
            const unavailable = item.requiredServices.some((service) => {
              const status = serviceStatus[service]?.status;
              return hasStatus && (!status || status !== DashboardServiceStatusState.DASHBOARD_SERVICE_AVAILABLE);
            });
            const statusText = unavailable
              ? item.requiredServices.map((service) => serviceStatus[service]?.message || `${service} 状态未知`).join('；')
              : '';
            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  isActive={activeView === item.key}
                  disabled={unavailable}
                  tooltip={statusText ? `${item.label}：${statusText}` : item.label}
                  onClick={() => onSelect(item.key)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
