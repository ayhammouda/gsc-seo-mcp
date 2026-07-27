import type * as z from "zod/v4";
import {
  emptyInputSchema,
  inspectUrlInputSchema,
  inspectUrlOutputSchema,
  listSitemapsInputSchema,
  listSitemapsOutputSchema,
  listSitesOutputSchema,
  searchAnalyticsInputSchema,
  searchAnalyticsOutputSchema
} from "../schemas.js";
import { READONLY_SCOPE } from "../types.js";
import { DEFAULT_CAPABILITY_BUDGETS } from "./budget-limits.js";

export const GSC_CAPABILITY_MANIFEST_VERSION = "2026-07-27.wp-02";
export const GSC_CONTAINMENT_CONTRACT_VERSION = "0.1.0-read-only.2";

export type CapabilityEffect = "read" | "mutation";
export type AutonomyClass = "bounded-read" | "human-confirmed-write" | "unsupported";
export type RetryClass = "idempotent-read" | "read-only-post" | "reconciled-write" | "never";
export type ApprovalClass = "none" | "exact-action";
export type CapabilityProfileMode = "local-stdio:read_only";

export type CapabilityResourceScope =
  | Readonly<{
      kind: "account";
      filterOutputByAllowedProperties: true;
    }>
  | Readonly<{
      kind: "property";
      propertyInputField: "site_url";
    }>
  | Readonly<{
      kind: "property-target";
      propertyInputField: "site_url";
      targetInputField: "inspection_url";
    }>;

export interface CapabilityAnnotations {
  readonly readOnlyHint: boolean;
  readonly openWorldHint: boolean;
}

export interface CapabilityDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly contractVersion: string;
  readonly effect: CapabilityEffect;
  readonly autonomyClass: AutonomyClass;
  readonly googleMethod: string;
  readonly requiredGoogleScopes: readonly string[];
  readonly requiredPropertyRoles: readonly string[];
  readonly profileModes: readonly CapabilityProfileMode[];
  readonly resourceScope: CapabilityResourceScope;
  readonly inputSchema: z.ZodType;
  readonly outputSchema: z.ZodType;
  readonly budgetProfile: string;
  readonly retryClass: RetryClass;
  readonly approvalClass: ApprovalClass;
  readonly annotations: CapabilityAnnotations;
}

export type UnsupportedReasonCode = "wp-00-containment";

export interface UnsupportedCapability {
  readonly name: string;
  readonly effect: CapabilityEffect;
  readonly autonomyClass: "unsupported";
  readonly reasonCode: UnsupportedReasonCode;
  readonly rationale: string;
  readonly reconsiderAfter: string;
}

export interface CapabilityRegistry {
  readonly version: string;
  readonly active: readonly CapabilityDefinition[];
  readonly unsupported: readonly UnsupportedCapability[];
  lookupActive(name: string): CapabilityDefinition | undefined;
  lookupUnsupported(name: string): UnsupportedCapability | undefined;
  listForProfile(profileMode: CapabilityProfileMode): readonly CapabilityDefinition[];
}

export interface CapabilityRegistryInput {
  readonly version: string;
  readonly active: readonly CapabilityDefinition[];
  readonly unsupported: readonly UnsupportedCapability[];
}

const READ_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  openWorldHint: true
});

function freezeResourceScope(scope: CapabilityResourceScope): CapabilityResourceScope {
  return Object.freeze({ ...scope });
}

function freezeCapability(definition: CapabilityDefinition): CapabilityDefinition {
  return Object.freeze({
    ...definition,
    requiredGoogleScopes: Object.freeze([...definition.requiredGoogleScopes]),
    requiredPropertyRoles: Object.freeze([...definition.requiredPropertyRoles]),
    profileModes: Object.freeze([...definition.profileModes]),
    resourceScope: freezeResourceScope(definition.resourceScope),
    annotations: Object.freeze({ ...definition.annotations })
  });
}

function freezeUnsupported(definition: UnsupportedCapability): UnsupportedCapability {
  return Object.freeze({ ...definition });
}

function assertUniqueNames(
  active: readonly CapabilityDefinition[],
  unsupported: readonly UnsupportedCapability[]
): void {
  const seen = new Set<string>();
  for (const entry of [...active, ...unsupported]) {
    if (entry.name.length === 0) {
      throw new Error("Capability names must be non-empty");
    }
    if (seen.has(entry.name)) {
      throw new Error(`Duplicate capability name: ${entry.name}`);
    }
    seen.add(entry.name);
  }
}

export function createCapabilityRegistry(input: CapabilityRegistryInput): CapabilityRegistry {
  if (input.version.length === 0) {
    throw new Error("Capability registry version is required");
  }

  const active = Object.freeze(input.active.map(freezeCapability));
  const unsupported = Object.freeze(input.unsupported.map(freezeUnsupported));
  assertUniqueNames(active, unsupported);

  const activeByName = new Map(active.map((entry) => [entry.name, entry] as const));
  const unsupportedByName = new Map(unsupported.map((entry) => [entry.name, entry] as const));

  return Object.freeze({
    version: input.version,
    active,
    unsupported,
    lookupActive(name: string): CapabilityDefinition | undefined {
      return activeByName.get(name);
    },
    lookupUnsupported(name: string): UnsupportedCapability | undefined {
      return unsupportedByName.get(name);
    },
    listForProfile(profileMode: CapabilityProfileMode): readonly CapabilityDefinition[] {
      return Object.freeze(active.filter((entry) => entry.profileModes.includes(profileMode)));
    }
  });
}

const activeCapabilities = [
  {
    name: "gsc_list_sites",
    title: "List Search Console Sites",
    description: "List allowlisted Search Console properties for the authenticated account.",
    contractVersion: GSC_CONTAINMENT_CONTRACT_VERSION,
    effect: "read",
    autonomyClass: "bounded-read",
    googleMethod: "webmasters.sites.list",
    requiredGoogleScopes: [READONLY_SCOPE],
    requiredPropertyRoles: [],
    profileModes: ["local-stdio:read_only"],
    resourceScope: { kind: "account", filterOutputByAllowedProperties: true },
    inputSchema: emptyInputSchema,
    outputSchema: listSitesOutputSchema,
    budgetProfile: "gsc-list-sites-contained",
    retryClass: "idempotent-read",
    approvalClass: "none",
    annotations: READ_ANNOTATIONS
  },
  {
    name: "gsc_search_analytics",
    title: "Query Search Analytics",
    description: "Query bounded Search Console performance rows for an allowlisted property.",
    contractVersion: GSC_CONTAINMENT_CONTRACT_VERSION,
    effect: "read",
    autonomyClass: "bounded-read",
    googleMethod: "webmasters.searchanalytics.query",
    requiredGoogleScopes: [READONLY_SCOPE],
    requiredPropertyRoles: [],
    profileModes: ["local-stdio:read_only"],
    resourceScope: { kind: "property", propertyInputField: "site_url" },
    inputSchema: searchAnalyticsInputSchema,
    outputSchema: searchAnalyticsOutputSchema,
    budgetProfile: "gsc-search-analytics-contained",
    retryClass: "read-only-post",
    approvalClass: "none",
    annotations: READ_ANNOTATIONS
  },
  {
    name: "gsc_list_sitemaps",
    title: "List Sitemaps",
    description: "List Search Console sitemaps for an allowlisted property.",
    contractVersion: GSC_CONTAINMENT_CONTRACT_VERSION,
    effect: "read",
    autonomyClass: "bounded-read",
    googleMethod: "webmasters.sitemaps.list",
    requiredGoogleScopes: [READONLY_SCOPE],
    requiredPropertyRoles: [],
    profileModes: ["local-stdio:read_only"],
    resourceScope: { kind: "property", propertyInputField: "site_url" },
    inputSchema: listSitemapsInputSchema,
    outputSchema: listSitemapsOutputSchema,
    budgetProfile: "gsc-list-sitemaps-contained",
    retryClass: "idempotent-read",
    approvalClass: "none",
    annotations: READ_ANNOTATIONS
  },
  {
    name: "gsc_inspect_url",
    title: "Inspect URL",
    description: "Inspect Google index status for a URL under an allowlisted property.",
    contractVersion: GSC_CONTAINMENT_CONTRACT_VERSION,
    effect: "read",
    autonomyClass: "bounded-read",
    googleMethod: "searchconsole.urlInspection.index.inspect",
    requiredGoogleScopes: [READONLY_SCOPE],
    requiredPropertyRoles: [],
    profileModes: ["local-stdio:read_only"],
    resourceScope: {
      kind: "property-target",
      propertyInputField: "site_url",
      targetInputField: "inspection_url"
    },
    inputSchema: inspectUrlInputSchema,
    outputSchema: inspectUrlOutputSchema,
    budgetProfile: "gsc-url-inspection-contained",
    retryClass: "read-only-post",
    approvalClass: "none",
    annotations: READ_ANNOTATIONS
  }
] as const satisfies readonly CapabilityDefinition[];

const unsupportedCapabilities = [
  {
    name: "gsc_submit_sitemap",
    effect: "mutation",
    autonomyClass: "unsupported",
    reasonCode: "wp-00-containment",
    rationale: "Mutation workflow is unavailable until governed approvals, durable intent, audit, and reconciliation land.",
    reconsiderAfter: "WP-09"
  },
  {
    name: "gsc_find_declining_pages",
    effect: "read",
    autonomyClass: "unsupported",
    reasonCode: "wp-00-containment",
    rationale: "Compound derived reads remain unavailable until workflow budgets and completeness contracts land.",
    reconsiderAfter: "WP-07"
  },
  {
    name: "gsc_find_keyword_opportunities",
    effect: "read",
    autonomyClass: "unsupported",
    reasonCode: "wp-00-containment",
    rationale: "Compound derived reads remain unavailable until workflow budgets and completeness contracts land.",
    reconsiderAfter: "WP-07"
  }
] satisfies readonly UnsupportedCapability[];

export const gscCapabilityRegistry = createCapabilityRegistry({
  version: GSC_CAPABILITY_MANIFEST_VERSION,
  active: activeCapabilities,
  unsupported: unsupportedCapabilities
});

const budgetNames = Object.keys(DEFAULT_CAPABILITY_BUDGETS);
if (
  budgetNames.length !== gscCapabilityRegistry.active.length ||
  gscCapabilityRegistry.active.some(
    (capability) =>
      DEFAULT_CAPABILITY_BUDGETS[capability.name]?.profileId !== capability.budgetProfile
  )
) {
  throw new Error("Active capability manifest and deterministic budget definitions must match exactly");
}

export type GscToolName = (typeof activeCapabilities)[number]["name"];

export const GSC_TOOL_NAMES: readonly GscToolName[] = Object.freeze(
  activeCapabilities.map((capability) => capability.name)
);

export const GSC_UNSUPPORTED_CAPABILITIES: readonly UnsupportedCapability[] = gscCapabilityRegistry.unsupported;

export const GSC_TOOL_SCHEMA_CONTRACTS: Readonly<
  Record<GscToolName, Readonly<{ input: z.ZodType; output: z.ZodType }>>
> = Object.freeze(
  Object.fromEntries(
    gscCapabilityRegistry.active.map((capability) => [
      capability.name,
      Object.freeze({ input: capability.inputSchema, output: capability.outputSchema })
    ])
  ) as Record<GscToolName, Readonly<{ input: z.ZodType; output: z.ZodType }>>
);
