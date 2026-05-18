import { create, fromJson, type JsonValue } from "@bufbuild/protobuf"
import {
  CapabilityAvailabilitySchema,
  CapabilityAvailabilityStatus,
  CapabilityDescriptorSchema,
  CapabilityKind,
  CapabilityTargetSchema,
  CapabilityVisibility,
  ContractReferenceSchema,
  ListServicesResponseSchema,
  ServiceDescriptorSchema,
  ServiceHealthStatus,
  type ServiceDescriptor,
} from "@byte-v-forge/contracts-ts/byte/v/forge/contracts/servicecatalog/v1/catalog_pb"

export {
  CapabilityAvailabilityStatus,
  CapabilityKind,
  CapabilityVisibility,
  ServiceHealthStatus,
}
export type { ServiceDescriptor }

const localCatalog = create(ListServicesResponseSchema, {
  services: [
    create(ServiceDescriptorSchema, {
      serviceId: "service-catalog",
      displayName: "服务目录",
      description: "服务、能力、契约引用和入口引用的发现入口。",
      owner: "platform",
      health: ServiceHealthStatus.SERVING,
      contracts: [
        create(ContractReferenceSchema, {
          contractRef: "contracts/servicecatalog/v1",
        }),
      ],
      capabilities: [
        create(CapabilityDescriptorSchema, {
          capabilityId: "servicecatalog.services",
          displayName: "服务发现",
          description: "列出已注册服务及其能力描述。",
          kind: CapabilityKind.QUERY,
          visibility: CapabilityVisibility.PUBLIC,
          ownerServiceId: "service-catalog",
          invocationRef: "catalog://service-catalog/servicecatalog.services",
          availability: create(CapabilityAvailabilitySchema, {
            status: CapabilityAvailabilityStatus.AVAILABLE,
          }),
        }),
      ],
    }),
    create(ServiceDescriptorSchema, {
      serviceId: "account-manager",
      displayName: "账号库存",
      description: "账号查询、凭据引用、账号分配和释放入口。",
      owner: "account",
      health: ServiceHealthStatus.SERVING,
      contracts: [
        create(ContractReferenceSchema, {
          contractRef: "contracts/account/v1",
        }),
      ],
      capabilities: [
        create(CapabilityDescriptorSchema, {
          capabilityId: "account.inventory.list",
          displayName: "账号查询",
          description: "按状态、标识和标签查询账号库存。",
          kind: CapabilityKind.QUERY,
          visibility: CapabilityVisibility.PUBLIC,
          ownerServiceId: "account-manager",
          inputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/ListAccountsRequest",
          }),
          outputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/ListAccountsResponse",
          }),
          invocationRef:
            "grpc://account-manager/AccountInventoryService.ListAccounts",
          targets: [
            create(CapabilityTargetSchema, {
              resourceType: "account",
            }),
          ],
          availability: create(CapabilityAvailabilitySchema, {
            status: CapabilityAvailabilityStatus.AVAILABLE,
          }),
        }),
        create(CapabilityDescriptorSchema, {
          capabilityId: "account.reservation.reserve",
          displayName: "账号占用",
          description: "按 selector 占用可用账号。",
          kind: CapabilityKind.ACTION,
          visibility: CapabilityVisibility.PUBLIC,
          ownerServiceId: "account-manager",
          inputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/ReserveAccountRequest",
          }),
          outputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/ReserveAccountResponse",
          }),
          invocationRef:
            "grpc://account-manager/AccountInventoryService.ReserveAccount",
          targets: [
            create(CapabilityTargetSchema, {
              resourceType: "account",
            }),
          ],
          availability: create(CapabilityAvailabilitySchema, {
            status: CapabilityAvailabilityStatus.AVAILABLE,
          }),
        }),
        create(CapabilityDescriptorSchema, {
          capabilityId: "account.tags.update",
          displayName: "账号标签",
          description: "更新账号级用户标签。",
          kind: CapabilityKind.ACTION,
          visibility: CapabilityVisibility.PUBLIC,
          ownerServiceId: "account-manager",
          inputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/UpdateAccountTagsRequest",
          }),
          outputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/UpdateAccountTagsResponse",
          }),
          invocationRef:
            "grpc://account-manager/AccountInventoryService.UpdateAccountTags",
          targets: [
            create(CapabilityTargetSchema, {
              resourceType: "account",
            }),
          ],
          availability: create(CapabilityAvailabilitySchema, {
            status: CapabilityAvailabilityStatus.AVAILABLE,
          }),
        }),
      ],
    }),
    create(ServiceDescriptorSchema, {
      serviceId: "gpt-service",
      displayName: "GPT 账号管理",
      description: "GPT 账号视图、扩展字段和库存查询入口。",
      owner: "gpt",
      health: ServiceHealthStatus.SERVING,
      contracts: [
        create(ContractReferenceSchema, {
          contractRef: "contracts/account/v1",
        }),
      ],
      capabilities: [
        create(CapabilityDescriptorSchema, {
          capabilityId: "gpt.account.inventory",
          displayName: "GPT 账号池",
          description: "查询 GPT 账号库存和公开展示字段。",
          kind: CapabilityKind.QUERY,
          visibility: CapabilityVisibility.PUBLIC,
          ownerServiceId: "gpt-service",
          inputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/ListAccountsRequest",
          }),
          outputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/ListAccountsResponse",
          }),
          invocationRef:
            "account://account-manager/accounts?account_type=gpt",
          targets: [
            create(CapabilityTargetSchema, {
              resourceType: "account.gpt",
            }),
          ],
          availability: create(CapabilityAvailabilitySchema, {
            status: CapabilityAvailabilityStatus.AVAILABLE,
          }),
        }),
        create(CapabilityDescriptorSchema, {
          capabilityId: "gpt.account.profile.refresh",
          displayName: "刷新 GPT 账号资料",
          description: "刷新 GPT 账号公开资料和扩展字段。",
          kind: CapabilityKind.ACTION,
          visibility: CapabilityVisibility.PUBLIC,
          ownerServiceId: "gpt-service",
          inputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/GetAccountRequest",
          }),
          outputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/GetAccountResponse",
          }),
          invocationRef:
            "grpc://gpt-service/GptAccountProfileService.RefreshProfile",
          targets: [
            create(CapabilityTargetSchema, {
              resourceType: "account.gpt",
            }),
          ],
          availability: create(CapabilityAvailabilitySchema, {
            status: CapabilityAvailabilityStatus.AVAILABLE,
          }),
        }),
      ],
    }),
    create(ServiceDescriptorSchema, {
      serviceId: "outlook-service",
      displayName: "Outlook 账号管理",
      description: "Outlook 账号视图、扩展字段和库存查询入口。",
      owner: "outlook",
      health: ServiceHealthStatus.SERVING,
      contracts: [
        create(ContractReferenceSchema, {
          contractRef: "contracts/account/v1",
        }),
      ],
      capabilities: [
        create(CapabilityDescriptorSchema, {
          capabilityId: "outlook.account.inventory",
          displayName: "Outlook 账号池",
          description: "查询 Outlook 账号库存和公开展示字段。",
          kind: CapabilityKind.QUERY,
          visibility: CapabilityVisibility.PUBLIC,
          ownerServiceId: "outlook-service",
          inputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/ListAccountsRequest",
          }),
          outputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/ListAccountsResponse",
          }),
          invocationRef:
            "account://account-manager/accounts?account_type=outlook",
          targets: [
            create(CapabilityTargetSchema, {
              resourceType: "account.outlook",
            }),
          ],
          availability: create(CapabilityAvailabilitySchema, {
            status: CapabilityAvailabilityStatus.AVAILABLE,
          }),
        }),
        create(CapabilityDescriptorSchema, {
          capabilityId: "outlook.account.profile.refresh",
          displayName: "刷新 Outlook 账号资料",
          description: "刷新 Outlook 账号公开资料和扩展字段。",
          kind: CapabilityKind.ACTION,
          visibility: CapabilityVisibility.PUBLIC,
          ownerServiceId: "outlook-service",
          inputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/GetAccountRequest",
          }),
          outputContract: create(ContractReferenceSchema, {
            contractRef: "contracts/account/v1/GetAccountResponse",
          }),
          invocationRef:
            "grpc://outlook-service/OutlookAccountProfileService.RefreshProfile",
          targets: [
            create(CapabilityTargetSchema, {
              resourceType: "account.outlook",
            }),
          ],
          availability: create(CapabilityAvailabilitySchema, {
            status: CapabilityAvailabilityStatus.AVAILABLE,
          }),
        }),
      ],
    }),
  ],
})

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

  const body = fromJson(
    ListServicesResponseSchema,
    (await response.json()) as JsonValue,
    { ignoreUnknownFields: true }
  )
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
      visibility: normalizeVisibility(capability.visibility),
      targets: capability.targets ?? [],
      dependencies: capability.dependencies ?? [],
      availability: capability.availability ?? create(CapabilityAvailabilitySchema, {
        status: CapabilityAvailabilityStatus.UNKNOWN,
      }),
    })),
  }))
}

function normalizeHealth(value: ServiceHealthStatus): ServiceHealthStatus {
  switch (value) {
    case ServiceHealthStatus.SERVING:
      return ServiceHealthStatus.SERVING
    case ServiceHealthStatus.DEGRADED:
      return ServiceHealthStatus.DEGRADED
    case ServiceHealthStatus.NOT_SERVING:
      return ServiceHealthStatus.NOT_SERVING
    case ServiceHealthStatus.UNKNOWN:
    default:
      return ServiceHealthStatus.UNKNOWN
  }
}

function normalizeVisibility(value: CapabilityVisibility): CapabilityVisibility {
  switch (value) {
    case CapabilityVisibility.INTERNAL:
      return CapabilityVisibility.INTERNAL
    case CapabilityVisibility.PRIVATE:
      return CapabilityVisibility.PRIVATE
    case CapabilityVisibility.PUBLIC:
    case CapabilityVisibility.UNSPECIFIED:
    default:
      return CapabilityVisibility.PUBLIC
  }
}

function normalizeKind(value: CapabilityKind): CapabilityKind {
  switch (value) {
    case CapabilityKind.PAGE:
      return CapabilityKind.PAGE
    case CapabilityKind.ACTION:
      return CapabilityKind.ACTION
    case CapabilityKind.WORKFLOW:
      return CapabilityKind.WORKFLOW
    case CapabilityKind.QUERY:
    default:
      return CapabilityKind.QUERY
  }
}
