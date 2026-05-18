export type ServiceHealthStatus =
  | "unknown"
  | "serving"
  | "degraded"
  | "not_serving"

export type CapabilityKind = "page" | "action" | "query" | "workflow"

export type ContractReference = {
  contractRef: string
}

export type CapabilityDescriptor = {
  capabilityId: string
  displayName: string
  description: string
  kind: CapabilityKind
  ownerServiceId: string
  inputContract?: ContractReference
  outputContract?: ContractReference
  invocationRef: string
}

export type ServiceDescriptor = {
  serviceId: string
  displayName: string
  description: string
  owner: string
  health: ServiceHealthStatus
  contracts: ContractReference[]
  capabilities: CapabilityDescriptor[]
  updatedAt?: string
}

export type ServiceCatalogResponse = {
  services: ServiceDescriptor[]
}

const localCatalog: ServiceCatalogResponse = {
  services: [
    {
      serviceId: "service-catalog",
      displayName: "服务目录",
      description: "服务、能力、契约引用和入口引用的发现入口。",
      owner: "platform",
      health: "serving",
      contracts: [{ contractRef: "contracts/servicecatalog/v1" }],
      capabilities: [
        {
          capabilityId: "servicecatalog.services",
          displayName: "服务发现",
          description: "列出已注册服务及其能力描述。",
          kind: "query",
          ownerServiceId: "service-catalog",
          invocationRef: "catalog://service-catalog/servicecatalog.services",
        },
      ],
    },
  ],
}

export async function listServices(): Promise<ServiceDescriptor[]> {
  const baseUrl = import.meta.env.VITE_SERVICE_CATALOG_API_BASE_URL as
    | string
    | undefined

  if (!baseUrl) {
    return localCatalog.services
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/services`)

  if (!response.ok) {
    throw new Error(`service catalog request failed: ${response.status}`)
  }

  const body = (await response.json()) as ServiceCatalogResponse
  return normalizeServices(body.services)
}

function normalizeServices(services: ServiceDescriptor[]): ServiceDescriptor[] {
  return services.map((service) => ({
    ...service,
    health: normalizeHealth(service.health),
    contracts: service.contracts ?? [],
    capabilities: (service.capabilities ?? []).map((capability) => ({
      ...capability,
      kind: normalizeKind(capability.kind),
    })),
  }))
}

function normalizeHealth(value: string): ServiceHealthStatus {
  switch (value) {
    case "SERVICE_HEALTH_STATUS_SERVING":
    case "serving":
      return "serving"
    case "SERVICE_HEALTH_STATUS_DEGRADED":
    case "degraded":
      return "degraded"
    case "SERVICE_HEALTH_STATUS_NOT_SERVING":
    case "not_serving":
      return "not_serving"
    case "SERVICE_HEALTH_STATUS_UNKNOWN":
    case "unknown":
    default:
      return "unknown"
  }
}

function normalizeKind(value: string): CapabilityKind {
  switch (value) {
    case "CAPABILITY_KIND_PAGE":
    case "page":
      return "page"
    case "CAPABILITY_KIND_ACTION":
    case "action":
      return "action"
    case "CAPABILITY_KIND_WORKFLOW":
    case "workflow":
      return "workflow"
    case "CAPABILITY_KIND_QUERY":
    case "query":
    default:
      return "query"
  }
}
