import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { redactSecrets } from "../security.js";
import type { InspectUrlInput, SearchAnalyticsInput } from "../schemas.js";
import {
  isSearchConsoleProperty,
  parseSearchConsoleProperty,
  parseSearchConsolePropertyAllowlist,
  requireTargetUnderProperty
} from "../resources/index.js";
import type { SearchConsoleProperty } from "../resources/index.js";
import type { GscService } from "../types.js";
import { GSC_TOOL_NAMES } from "./manifest.js";
import type { GscToolName } from "./manifest.js";
import type {
  AuditPort,
  BudgetReservationRequest,
  BudgetPort,
  ErrorPort,
  ExecutorPort,
  ExecutorRequest,
  NormalizedCapabilityResource,
  OutputFilterRequest,
  StaticPolicyRequest,
  StaticPolicyPort,
  TerminalAuditEvent
} from "./ports.js";
import type { CallerIdentity } from "./profile.js";

export interface ExactPropertyAllowlistOptions {
  readonly allowedProperties: readonly string[];
  readonly expectedIdentity: CallerIdentity;
  readonly policyKey?: string;
}

export interface GscServiceExecutorPort extends ExecutorPort {
  readonly supportedTools: readonly GscToolName[];
}

export interface EphemeralAuditPort extends AuditPort {
  snapshot(): readonly TerminalAuditEvent[];
}

export interface EphemeralAuditOptions {
  readonly maxEvents?: number;
}

export type GscServiceProvider = () => GscService | Promise<GscService>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactPropertyMap(
  properties: readonly string[]
): ReadonlyMap<string, SearchConsoleProperty> {
  const parsed = parseSearchConsolePropertyAllowlist(properties);
  return new Map(parsed.map((property) => [property.policyKey, property] as const));
}

function filterSiteInventory(
  request: OutputFilterRequest,
  properties: ReadonlyMap<string, SearchConsoleProperty>
): unknown {
  if (
    request.capability.resourceScope.kind !== "account" ||
    request.capability.resourceScope.filterOutputByAllowedProperties !== true ||
    !isRecord(request.output) ||
    !Array.isArray(request.output.sites)
  ) {
    return request.output;
  }

  return {
    ...request.output,
    sites: request.output.sites.filter(
      (site) => {
        if (!isRecord(site) || typeof site.siteUrl !== "string") return false;
        try {
          return properties.has(parseSearchConsoleProperty(site.siteUrl).policyKey);
        } catch {
          return false;
        }
      }
    )
  };
}

export function createExactPropertyAllowlistPolicy(options: ExactPropertyAllowlistOptions): StaticPolicyPort {
  const allowedProperties = exactPropertyMap(options.allowedProperties);
  if (options.expectedIdentity.actorId.length === 0 || options.expectedIdentity.tenantId.length === 0) {
    throw new Error("Expected local caller identity is required");
  }
  const expectedIdentity = Object.freeze({ ...options.expectedIdentity });
  const policyKey = options.policyKey ?? "containment-exact-property-allowlist";

  return Object.freeze({
    authorizeStatic: (request: StaticPolicyRequest) => {
      if (
        request.context.deploymentProfile !== "local-stdio" ||
        request.context.transport !== "stdio" ||
        request.context.accessMode !== "read_only" ||
        request.context.actorId !== expectedIdentity.actorId ||
        request.context.tenantId !== expectedIdentity.tenantId ||
        request.capability.effect !== "read"
      ) {
        return Promise.resolve(
          Object.freeze({
            outcome: "deny" as const,
            policyKey,
            reason: "Only bounded read capabilities are permitted during containment"
          })
        );
      }

      let authorizedResource: NormalizedCapabilityResource;
      if (request.resource.kind === "account") {
        authorizedResource = Object.freeze({ kind: "account" });
      } else {
        if (!isSearchConsoleProperty(request.resource.property)) {
          return Promise.resolve(
            Object.freeze({
              outcome: "deny" as const,
              policyKey,
              reason: "Capability resource is not a normalized Search Console property"
            })
          );
        }
        const configuredProperty = allowedProperties.get(request.resource.property.policyKey);
        if (!configuredProperty) {
          return Promise.resolve(
            Object.freeze({
              outcome: "deny" as const,
              policyKey,
              reason: "Search Console property is not allowed by the exact property policy"
            })
          );
        }
        if (request.resource.kind === "property") {
          authorizedResource = Object.freeze({
            kind: "property",
            property: configuredProperty
          });
        } else {
          try {
            requireTargetUnderProperty(configuredProperty, request.resource.target);
          } catch {
            return Promise.resolve(
              Object.freeze({
                outcome: "deny" as const,
                policyKey,
                reason: "Capability target is not contained by the configured Search Console property"
              })
            );
          }
          authorizedResource = Object.freeze({
            kind: "property-target",
            property: configuredProperty,
            target: request.resource.target
          });
        }
      }

      return Promise.resolve(
        Object.freeze({ outcome: "allow" as const, policyKey, authorizedResource })
      );
    },
    filterOutput: (request: OutputFilterRequest) => Promise.resolve(filterSiteInventory(request, allowedProperties))
  });
}

export function createPassThroughBudgetPort(): BudgetPort {
  return Object.freeze({
    assertInput: () => {},
    reserve: (request: BudgetReservationRequest) =>
      Promise.resolve(
        Object.freeze({
          status: "reserved" as const,
          reservationId: `ephemeral:${request.context.requestId}`,
          consumeGatewayOperation: () => {},
          release: () => Promise.resolve()
        })
      ),
    assertRawOutput: () => {},
    assertOutput: () => {}
  });
}

export function createRedactingCallToolResultErrorPort(): ErrorPort {
  return Object.freeze({
    toCallToolResult(error: unknown): CallToolResult {
      const rawMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: redactSecrets(rawMessage) }],
        isError: true
      };
    }
  });
}

export function createEphemeralAuditPort(options: EphemeralAuditOptions = {}): EphemeralAuditPort {
  const maxEvents = options.maxEvents ?? 256;
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 10_000) {
    throw new Error("Ephemeral audit maxEvents must be an integer from 1 to 10000");
  }
  const events: TerminalAuditEvent[] = [];
  return Object.freeze({
    durability: "ephemeral" as const,
    recordTerminal(event: TerminalAuditEvent): Promise<void> {
      events.push(Object.freeze({ ...event }));
      if (events.length > maxEvents) {
        events.splice(0, events.length - maxEvents);
      }
      return Promise.resolve();
    },
    snapshot(): readonly TerminalAuditEvent[] {
      return Object.freeze(events.map((event) => Object.freeze({ ...event })));
    }
  });
}

type GscExecutorHandler = (service: GscService, request: ExecutorRequest) => Promise<unknown>;

const GSC_READ_EXECUTOR_TABLE = new Map<string, GscExecutorHandler>([
  [
    "gsc_list_sites",
    (service, request) => service.listSites(request.signal)
  ],
  [
    "gsc_search_analytics",
    (service, request) => {
      if (request.resource.kind !== "property") {
        throw new Error("Search Analytics requires an authorized property resource");
      }
      const input = request.input as SearchAnalyticsInput;
      return service.searchAnalytics(
        Object.freeze({ ...input, site_url: request.resource.property.apiValue }),
        request.signal
      );
    }
  ],
  [
    "gsc_list_sitemaps",
    (service, request) => {
      if (request.resource.kind !== "property") {
        throw new Error("Sitemaps list requires an authorized property resource");
      }
      return service.listSitemaps(request.resource.property.apiValue, request.signal);
    }
  ],
  [
    "gsc_inspect_url",
    (service, request) => {
      if (request.resource.kind !== "property-target") {
        throw new Error("URL Inspection requires an authorized property-target resource");
      }
      const input = request.input as InspectUrlInput;
      return service.inspectUrl(
        Object.freeze({
          ...input,
          site_url: request.resource.property.apiValue,
          inspection_url: request.resource.target.apiValue
        }),
        request.signal
      );
    }
  ]
]);

export function createGscServiceExecutorPort(
  getService: GscServiceProvider
): GscServiceExecutorPort {
  if (typeof getService !== "function") {
    throw new Error("A lazy GscService provider is required");
  }

  const supportedTools: readonly GscToolName[] = Object.freeze([...GSC_TOOL_NAMES]);
  if (
    GSC_READ_EXECUTOR_TABLE.size !== supportedTools.length ||
    supportedTools.some((toolName) => !GSC_READ_EXECUTOR_TABLE.has(toolName))
  ) {
    throw new Error("Containment GscService executor table does not match the active capability manifest");
  }
  return Object.freeze({
    supportedTools,
    async execute(request: ExecutorRequest): Promise<unknown> {
      const handler = GSC_READ_EXECUTOR_TABLE.get(request.capability.name);
      if (!handler) {
        throw new Error(`No containment executor is registered for ${request.capability.name}`);
      }
      const service = await getService();
      return handler(service, request);
    }
  });
}
