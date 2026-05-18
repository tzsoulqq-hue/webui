import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import {
  Activity,
  Boxes,
  CircleDot,
  ListTree,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Zap,
} from "lucide-react"
import { useMemo, useState } from "react"
import { create } from "@bufbuild/protobuf"
import {
  AccountCredentialRefSchema,
  AccountCredentialStatus,
  AccountCredentialType,
  AccountIdentifierKind,
  AccountIdentifierSchema,
  AccountLifecycleStatus,
  AccountSchema,
  type Account,
} from "@byte-v-forge/contracts-ts/byte/v/forge/contracts/account/v1/account_pb"
import {
  AccountList,
  AccountStatusFilter,
  AccountSummary,
} from "@byte-v-forge/uikit"
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query"

import {
  CapabilityAvailabilityStatus,
  CapabilityKind,
  ServiceHealthStatus,
  type ServiceDescriptor,
  listServices,
} from "@/api/service-catalog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

type CatalogService = ServiceDescriptor & {
  activeCount: number
  backlogCount: number
}

type CatalogCapability = ServiceDescriptor["capabilities"][number]

type AccountScope = {
  serviceId: string
  displayName: string
  description: string
  health: ServiceHealthStatus
  capabilities: CatalogCapability[]
}

const queryClient = new QueryClient()
const overviewKey = "overview"
const localAccounts = [
  create(AccountSchema, {
    accountId: "acct_demo_active",
    displayName: "GPT account pool",
    primaryIdentifier: create(AccountIdentifierSchema, {
      kind: AccountIdentifierKind.EMAIL,
      value: "pool@example.test",
      verified: true,
    }),
    status: AccountLifecycleStatus.ACTIVE,
    accountType: "gpt",
    credentials: [
      create(AccountCredentialRefSchema, {
        credentialId: "cred_demo_password",
        accountId: "acct_demo_active",
        type: AccountCredentialType.PASSWORD,
        status: AccountCredentialStatus.ACTIVE,
        secretRef: "secret://account/acct_demo_active/password",
      }),
      create(AccountCredentialRefSchema, {
        credentialId: "cred_demo_session",
        accountId: "acct_demo_active",
        type: AccountCredentialType.SESSION_COOKIE,
        status: AccountCredentialStatus.ROTATION_REQUIRED,
        secretRef: "secret://account/acct_demo_active/session",
      }),
    ],
    labels: {
      owner_service: "gpt-service",
      tier: "warm",
    },
    tags: {
      channel: "pool",
    },
  }),
  create(AccountSchema, {
    accountId: "acct_demo_locked",
    displayName: "Outlook recovery pool",
    primaryIdentifier: create(AccountIdentifierSchema, {
      kind: AccountIdentifierKind.EMAIL,
      value: "recovery@example.test",
    }),
    status: AccountLifecycleStatus.RECOVERY_REQUIRED,
    accountType: "outlook",
    credentials: [
      create(AccountCredentialRefSchema, {
        credentialId: "cred_demo_recovery",
        accountId: "acct_demo_locked",
        type: AccountCredentialType.RECOVERY_CODE,
        status: AccountCredentialStatus.ACTIVE,
        secretRef: "secret://account/acct_demo_locked/recovery",
      }),
    ],
    labels: {
      owner_service: "outlook-service",
      tier: "recovery",
    },
    tags: {
      channel: "recovery",
    },
  }),
]

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Dashboard />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

function Dashboard() {
  const [activeServiceId, setActiveServiceId] = useState(overviewKey)
  const [environment, setEnvironment] = useState("local")
  const [query, setQuery] = useState("")
  const [kindFilter, setKindFilter] = useState<"all" | CapabilityKind>("all")
  const [accountScopeFilter, setAccountScopeFilter] = useState("all")
  const [accountStatusFilter, setAccountStatusFilter] = useState<
    "all" | AccountLifecycleStatus
  >("all")
  const [selectedAccountId, setSelectedAccountId] = useState(
    localAccounts[0]?.accountId
  )

  const servicesQuery = useQuery({
    queryKey: ["service-catalog", environment],
    queryFn: listServices,
  })

  const services = useMemo(() => {
    return (servicesQuery.data ?? []).map(toCatalogService)
  }, [servicesQuery.data])

  const selectedService = services.find(
    (service) => service.serviceId === activeServiceId
  )

  const capabilityRows = useMemo(() => {
    return services.flatMap((service) =>
      service.capabilities.map((capability) => ({
        ...capability,
        serviceName: service.displayName,
        serviceHealth: service.health,
      }))
    )
  }, [services])

  const visibleCapabilities = useMemo(() => {
    const keyword = query.trim().toLowerCase()

    return capabilityRows.filter((capability) => {
      const serviceMatched =
        activeServiceId === overviewKey ||
        capability.ownerServiceId === activeServiceId
      const kindMatched = kindFilter === "all" || capability.kind === kindFilter

      if (!serviceMatched || !kindMatched) {
        return false
      }

      if (!keyword) {
        return true
      }

      return [
        capability.capabilityId,
        capability.displayName,
        capability.description,
        capability.serviceName,
        capability.invocationRef,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    })
  }, [activeServiceId, capabilityRows, kindFilter, query])

  const accountScopes = useMemo(() => {
    return services
      .map((service): AccountScope => {
        return {
          serviceId: service.serviceId,
          displayName: service.displayName,
          description: service.description,
          health: service.health,
          capabilities: service.capabilities.filter(isAccountCapability),
        }
      })
      .filter((scope) => scope.capabilities.length > 0)
  }, [services])

  const visibleAccounts = useMemo(() => {
    return localAccounts.filter((account) => {
      const scopeMatched =
        accountScopeFilter === "all" ||
        account.labels.owner_service === accountScopeFilter
      const statusMatched =
        accountStatusFilter === "all" || account.status === accountStatusFilter

      return scopeMatched && statusMatched
    })
  }, [accountScopeFilter, accountStatusFilter])

  const effectiveSelectedAccountId = visibleAccounts.some(
    (account) => account.accountId === selectedAccountId
  )
    ? selectedAccountId
    : visibleAccounts[0]?.accountId

  const selectedAccount = localAccounts.find(
    (account) => account.accountId === effectiveSelectedAccountId
  )
  const selectedAccountSource = services.find(
    (service) => service.serviceId === selectedAccount?.labels.owner_service
  )
  const selectedAccountResourceTypes = useMemo(
    () =>
      selectedAccount ? accountResourceTypes(selectedAccount) : ["account"],
    [selectedAccount]
  )
  const selectedAccountActions = useMemo(() => {
    const targets = new Set(selectedAccountResourceTypes)

    return capabilityRows.filter((capability) => {
      return (
        capability.kind === CapabilityKind.ACTION &&
        capabilityTargetsAnyResource(capability, targets)
      )
    })
  }, [capabilityRows, selectedAccountResourceTypes])

  const totalActive = services.reduce(
    (sum, service) => sum + service.activeCount,
    0
  )
  const totalBacklog = services.reduce(
    (sum, service) => sum + service.backlogCount,
    0
  )
  const pageTitle = selectedService?.displayName ?? "总览"
  const pageDescription =
    selectedService?.description ?? "通过服务目录发现业务服务和能力。"

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="border-b bg-sidebar text-sidebar-foreground lg:border-r lg:border-b-0">
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center gap-3 px-4">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Boxes className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  Register Console
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  service catalog
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 px-2 pb-4">
              <nav className="space-y-1">
                <ServiceNavButton
                  active={activeServiceId === overviewKey}
                  health={ServiceHealthStatus.SERVING}
                  icon={Activity}
                  label="总览"
                  onClick={() => setActiveServiceId(overviewKey)}
                />
                {services.map((service) => (
                  <ServiceNavButton
                    key={service.serviceId}
                    active={service.serviceId === activeServiceId}
                    health={service.health}
                    icon={ListTree}
                    label={service.displayName}
                    onClick={() => setActiveServiceId(service.serviceId)}
                  />
                ))}
              </nav>
            </ScrollArea>

            <div className="border-t p-4 text-xs text-muted-foreground">
              目录视图随服务注册更新。
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <header className="flex min-h-16 flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{pageTitle}</div>
              <div className="truncate text-xs text-muted-foreground">
                {pageDescription}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger className="h-8 w-[132px]">
                  <SelectValue aria-label={environment} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="prod">Production</SelectItem>
                </SelectContent>
              </Select>
              <IconButton
                label="刷新目录"
                onClick={() => void servicesQuery.refetch()}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
              </IconButton>
              <ThemeToggle />
            </div>
          </header>

          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="min-w-0 px-4 py-4 lg:px-6">
              <div className="grid gap-3 md:grid-cols-3">
                <Metric
                  label="发现服务"
                  value={String(services.length)}
                  detail="来自 servicecatalog"
                />
                <Metric
                  label="发现能力"
                  value={String(capabilityRows.length)}
                  detail="按 descriptor 渲染"
                />
                <Metric
                  label="运行信号"
                  value={String(totalActive + totalBacklog)}
                  detail="目录投影状态"
                />
              </div>

              {servicesQuery.isError ? (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  服务目录读取失败，当前无法发现业务能力。
                </div>
              ) : null}

              <div className="mt-6 rounded-lg border bg-card">
                <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-sm font-medium">账号库存</div>
                    <div className="text-xs text-muted-foreground">
                      按账号类型、来源服务和状态筛选账号池。
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <AccountScopeFilter
                      scopes={accountScopes}
                      value={accountScopeFilter}
                      onChange={setAccountScopeFilter}
                    />
                    <AccountStatusFilter
                      value={accountStatusFilter}
                      onChange={setAccountStatusFilter}
                    />
                  </div>
                </div>
                <AccountList
                  accounts={visibleAccounts}
                  selectedAccountId={effectiveSelectedAccountId}
                  onAccountSelect={(account: Account) =>
                    setSelectedAccountId(account.accountId)
                  }
                />
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {services.map((service) => {
                  const active = activeServiceId === service.serviceId

                  return (
                    <button
                      key={service.serviceId}
                      className={cn(
                        "group rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/60",
                        active && "border-foreground"
                      )}
                      type="button"
                      onClick={() => setActiveServiceId(service.serviceId)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                            <ListTree className="size-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {service.displayName}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {service.owner}
                            </div>
                          </div>
                        </div>
                        <HealthBadge state={service.health} />
                      </div>
                      <p className="mt-3 min-h-10 text-xs leading-5 text-muted-foreground">
                        {service.description}
                      </p>
                      <div className="mt-3 flex items-center gap-4 text-xs">
                        <span>{service.capabilities.length} capability</span>
                        <span className="text-muted-foreground">
                          {service.contracts.length} contract
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="mt-6 rounded-lg border bg-card">
                <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-medium">能力目录</div>
                    <div className="text-xs text-muted-foreground">
                      按服务、类型和入口引用查看能力。
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        className="h-8 w-[220px] pl-7"
                        placeholder="搜索能力"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </div>
                    <Tabs
                      value={kindFilter === "all" ? "all" : String(kindFilter)}
                      onValueChange={(value) =>
                        setKindFilter(parseCapabilityKindFilter(value))
                      }
                    >
                      <TabsList className="h-8">
                        <TabsTrigger value="all">全部</TabsTrigger>
                        <TabsTrigger value={String(CapabilityKind.PAGE)}>
                          页面
                        </TabsTrigger>
                        <TabsTrigger value={String(CapabilityKind.ACTION)}>
                          动作
                        </TabsTrigger>
                        <TabsTrigger value={String(CapabilityKind.QUERY)}>
                          查询
                        </TabsTrigger>
                        <TabsTrigger value={String(CapabilityKind.WORKFLOW)}>
                          流程
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>

                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>能力</TableHead>
                      <TableHead>服务</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>入口引用</TableHead>
                      <TableHead className="text-right">健康</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleCapabilities.map((capability) => (
                      <TableRow key={capability.capabilityId}>
                        <TableCell>
                          <div className="font-medium">
                            {capability.displayName}
                          </div>
                          <div className="max-w-[360px] truncate text-xs text-muted-foreground">
                            {capability.description}
                          </div>
                        </TableCell>
                        <TableCell>{capability.serviceName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {capabilityKindLabel(capability.kind)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {capability.invocationRef}
                        </TableCell>
                        <TableCell className="text-right">
                          <HealthBadge state={capability.serviceHealth} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            <aside className="border-t px-4 py-4 xl:border-t-0 xl:border-l">
              <div className="space-y-5">
                <section>
                  <div className="mb-3 text-sm font-medium">发现边界</div>
                  <div className="space-y-3 text-sm">
                    <BoundaryLine
                      label="服务目录"
                      value="contracts/servicecatalog"
                    />
                    <BoundaryLine label="服务地址" value="Kubernetes DNS" />
                    <BoundaryLine label="健康语义" value="gRPC Health" />
                    <BoundaryLine label="调试发现" value="gRPC Reflection" />
                  </div>
                </section>

                <Separator />

                <section>
                  <div className="mb-3 text-sm font-medium">当前账号</div>
                  {selectedAccount ? (
                    <div className="space-y-3">
                      <AccountSummary account={selectedAccount} compact />
                      <div className="space-y-2 text-sm">
                        <BoundaryLine
                          label="账号来源"
                          value={selectedAccountSource?.displayName ?? "未注册"}
                        />
                        <BoundaryLine
                          label="来源服务"
                          value={selectedAccount.labels.owner_service || "-"}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">
                          可用动作
                        </div>
                        {selectedAccountActions.length > 0 ? (
                          <div className="grid gap-2">
                            {selectedAccountActions.map((capability) => (
                              <Button
                                key={capability.capabilityId}
                                className="justify-start gap-2"
                                disabled={!capabilityAvailable(capability)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <Zap className="size-3.5" aria-hidden="true" />
                                <span className="min-w-0 flex-1 truncate text-left">
                                  {capability.displayName}
                                </span>
                                <Badge variant="secondary">
                                  {capabilityAvailabilityLabel(capability)}
                                </Badge>
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
                            未发现动作
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                      暂无账号
                    </div>
                  )}
                </section>

                <Separator />

                <section>
                  <div className="mb-3 text-sm font-medium">当前服务</div>
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{pageTitle}</div>
                        <div className="text-xs text-muted-foreground">
                          owner: {selectedService?.owner ?? "platform"}
                        </div>
                      </div>
                      <HealthBadge
                        state={
                          selectedService?.health ?? ServiceHealthStatus.SERVING
                        }
                      />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      {pageDescription}
                    </p>
                  </div>
                </section>

                <Separator />

                <section>
                  <div className="mb-3 text-sm font-medium">契约引用</div>
                  <div className="space-y-2 text-xs">
                    {selectedService ? (
                      selectedService.contracts.map((contract) => (
                        <StatusLine
                          key={contract.contractRef}
                          label={contract.contractRef}
                          ok
                        />
                      ))
                    ) : (
                      <StatusLine label="contracts/servicecatalog/v1" ok />
                    )}
                  </div>
                </section>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}

function toCatalogService(service: ServiceDescriptor): CatalogService {
  const degraded =
    service.health === ServiceHealthStatus.DEGRADED ||
    service.health === ServiceHealthStatus.NOT_SERVING

  return {
    ...service,
    activeCount: service.capabilities.length,
    backlogCount: degraded ? 1 : 0,
  }
}

function ServiceNavButton({
  active,
  health,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  health: ServiceHealthStatus
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
      )}
      type="button"
      onClick={onClick}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <HealthDot state={health} />
    </button>
  )
}

function AccountScopeFilter({
  scopes,
  value,
  onChange,
}: {
  scopes: AccountScope[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        aria-pressed={value === "all"}
        size="sm"
        type="button"
        variant={value === "all" ? "default" : "outline"}
        onClick={() => onChange("all")}
      >
        全部来源
      </Button>
      {scopes.map((scope) => (
        <Button
          key={scope.serviceId}
          aria-pressed={value === scope.serviceId}
          size="sm"
          type="button"
          variant={value === scope.serviceId ? "default" : "outline"}
          onClick={() => onChange(scope.serviceId)}
        >
          {scope.displayName}
        </Button>
      ))}
    </div>
  )
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-normal">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  )
}

function BoundaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function StatusLine({ label, ok = false }: { label: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="min-w-0 truncate">{label}</span>
      <Badge variant={ok ? "default" : "secondary"}>
        {ok ? "ready" : "pending"}
      </Badge>
    </div>
  )
}

function HealthBadge({ state }: { state: ServiceHealthStatus }) {
  const label = healthLabel(state)

  return (
    <Badge
      variant={
        state === ServiceHealthStatus.DEGRADED ||
        state === ServiceHealthStatus.NOT_SERVING
          ? "destructive"
          : "secondary"
      }
      className={cn(
        state === ServiceHealthStatus.SERVING && "bg-emerald-600 text-white"
      )}
    >
      <HealthDot state={state} />
      {label}
    </Badge>
  )
}

function HealthDot({ state }: { state: ServiceHealthStatus }) {
  return (
    <CircleDot
      className={cn(
        "size-3",
        state === ServiceHealthStatus.SERVING && "text-emerald-500",
        (state === ServiceHealthStatus.DEGRADED ||
          state === ServiceHealthStatus.NOT_SERVING) &&
          "text-destructive",
        (state === ServiceHealthStatus.UNKNOWN ||
          state === ServiceHealthStatus.UNSPECIFIED) &&
          "text-muted-foreground"
      )}
      aria-hidden="true"
    />
  )
}

function isAccountCapability(capability: CatalogCapability) {
  if (capability.targets.some((target) => target.resourceType === "account")) {
    return true
  }
  if (
    capability.targets.some((target) =>
      target.resourceType.startsWith("account.")
    )
  ) {
    return true
  }

  return [
    capability.capabilityId,
    capability.invocationRef,
    capability.inputContract?.contractRef ?? "",
    capability.outputContract?.contractRef ?? "",
  ].some((value) => value.toLowerCase().includes("account"))
}

function accountResourceTypes(account: Account) {
  const accountType = account.accountType

  if (!accountType) {
    return ["account"]
  }

  return ["account", `account.${accountType}`]
}

function capabilityTargetsAnyResource(
  capability: CatalogCapability,
  resourceTypes: Set<string>
) {
  if (capability.targets.length === 0) {
    return false
  }

  return capability.targets.some((target) =>
    resourceTypes.has(target.resourceType)
  )
}

function capabilityAvailable(capability: CatalogCapability) {
  return (
    capability.availability?.status === CapabilityAvailabilityStatus.AVAILABLE
  )
}

function capabilityAvailabilityLabel(capability: CatalogCapability) {
  switch (capability.availability?.status) {
    case CapabilityAvailabilityStatus.AVAILABLE:
      return "ready"
    case CapabilityAvailabilityStatus.UNAVAILABLE:
      return capability.availability.reasonCode || "unavailable"
    case CapabilityAvailabilityStatus.UNKNOWN:
    case CapabilityAvailabilityStatus.UNSPECIFIED:
    default:
      return "unknown"
  }
}

function capabilityKindLabel(kind: CapabilityKind) {
  switch (kind) {
    case CapabilityKind.PAGE:
      return "页面"
    case CapabilityKind.ACTION:
      return "动作"
    case CapabilityKind.WORKFLOW:
      return "流程"
    case CapabilityKind.QUERY:
      return "查询"
    case CapabilityKind.UNSPECIFIED:
    default:
      return "查询"
  }
}

function healthLabel(state: ServiceHealthStatus) {
  switch (state) {
    case ServiceHealthStatus.SERVING:
      return "serving"
    case ServiceHealthStatus.DEGRADED:
      return "degraded"
    case ServiceHealthStatus.NOT_SERVING:
      return "not serving"
    case ServiceHealthStatus.UNKNOWN:
    case ServiceHealthStatus.UNSPECIFIED:
    default:
      return "unknown"
  }
}

function parseCapabilityKindFilter(value: string): "all" | CapabilityKind {
  switch (Number(value)) {
    case CapabilityKind.PAGE:
      return CapabilityKind.PAGE
    case CapabilityKind.ACTION:
      return CapabilityKind.ACTION
    case CapabilityKind.QUERY:
      return CapabilityKind.QUERY
    case CapabilityKind.WORKFLOW:
      return CapabilityKind.WORKFLOW
    default:
      return "all"
  }
}

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          size="icon"
          type="button"
          variant="outline"
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const dark = theme === "dark"

  return (
    <IconButton
      label={dark ? "切换浅色" : "切换深色"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </IconButton>
  )
}

export default App
