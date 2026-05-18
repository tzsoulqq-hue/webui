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
  return body.services
}
