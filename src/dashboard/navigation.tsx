import { Monitor, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/components/theme-provider';
import { DashboardServiceStatusState } from '@/proto/dashboard';
import type { DashboardNavItem, ServiceStatusMap } from './module-registry';

const THEME_OPTIONS = [
  { value: 'system', label: '跟随系统', Icon: Monitor },
  { value: 'light', label: '亮色', Icon: Sun },
  { value: 'dark', label: '暗色', Icon: Moon }
] as const;

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
        <SidebarMenuButton tooltip="展开侧栏" aria-label="展开侧栏" className="dashboardSidebarBrand collapsedBrand" onClick={toggleSidebar}>
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
  const currentTheme = THEME_OPTIONS.find((item) => item.value === theme) ?? THEME_OPTIONS[0];
  const CurrentIcon = currentTheme.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`主题：${currentTheme.label}`}
          title={`主题：${currentTheme.label}`}
          className="sidebarBrandIconButton"
        >
          <CurrentIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-32">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            const nextTheme = THEME_OPTIONS.find((item) => item.value === value)?.value;
            if (nextTheme) setTheme(nextTheme);
          }}
        >
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="themeMenuItem">
              <Icon />
              <span>{label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
                  size="lg"
                  isActive={activeView === item.key}
                  disabled={unavailable}
                  aria-label={item.label}
                  tooltip={statusText ? `${item.label}：${statusText}` : item.label}
                  className="dashboardSidebarNavButton"
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
