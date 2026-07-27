import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createCapabilityRegistry,
  createDeploymentProfile,
  createRequestContextFactory,
  DEFAULT_CAPABILITY_BUDGETS,
  GSC_TOOL_NAMES,
  GSC_TOOL_SCHEMA_CONTRACTS,
  GSC_UNSUPPORTED_CAPABILITIES,
  gscCapabilityRegistry,
  MAX_ACTOR_CONCURRENCY,
  MAX_PROCESS_CONCURRENCY,
  MAX_PROPERTY_CONCURRENCY,
  READ_ATTEMPT_TIMEOUT_MS,
  READ_TOTAL_DEADLINE_MS
} from "../../src/kernel/index.js";

const WP_01_MANIFEST_FIXTURE = new URL(
  "../fixtures/contracts/wp-01-capability-manifest.json",
  import.meta.url
);
const WP_02_MANIFEST_FIXTURE = new URL(
  "../fixtures/contracts/wp-02-capability-manifest.json",
  import.meta.url
);
const WP_02_BUDGET_FIXTURE = new URL(
  "../fixtures/contracts/wp-02-budget-profiles.json",
  import.meta.url
);
const WP_01_MANIFEST_FIXTURE_SHA256 =
  "c899073cd81f34a7877194eb08b60eb739671f729465374807cf800494793efe";

const PROFILE_INPUT = {
  profileId: "contained-local",
  deploymentProfile: "local-stdio",
  accessMode: "read_only",
  transport: "stdio",
  allowedProperties: ["https://example.com/"],
  totalDeadlineMs: 30_000
} as const;

function currentCapabilityManifest(): unknown {
  const active = gscCapabilityRegistry.active.map(
    ({
      name,
      contractVersion,
      effect,
      autonomyClass,
      googleMethod,
      requiredGoogleScopes,
      requiredPropertyRoles,
      profileModes,
      resourceScope,
      budgetProfile,
      retryClass,
      approvalClass,
      annotations
    }) => ({
      name,
      contractVersion,
      effect,
      autonomyClass,
      googleMethod,
      requiredGoogleScopes,
      requiredPropertyRoles,
      profileModes,
      resourceScope,
      budgetProfile,
      retryClass,
      approvalClass,
      annotations
    })
  );
  const unsupported = gscCapabilityRegistry.unsupported.map(
    ({ name, effect, autonomyClass, reasonCode, reconsiderAfter }) => ({
      name,
      effect,
      autonomyClass,
      reasonCode,
      reconsiderAfter
    })
  );

  return { version: gscCapabilityRegistry.version, active, unsupported };
}

function currentBudgetProfiles(): unknown {
  return {
    attemptTimeoutMs: READ_ATTEMPT_TIMEOUT_MS,
    totalDeadlineMs: READ_TOTAL_DEADLINE_MS,
    concurrency: {
      actor: MAX_ACTOR_CONCURRENCY,
      property: MAX_PROPERTY_CONCURRENCY,
      process: MAX_PROCESS_CONCURRENCY
    },
    capabilities: DEFAULT_CAPABILITY_BUDGETS
  };
}

describe("deployment profile and request context", () => {
  it("constructs frozen profile and request context values", () => {
    const profile = createDeploymentProfile(PROFILE_INPUT);
    const contextFactory = createRequestContextFactory({
      profile,
      createRequestId: () => "request-1",
      now: () => new Date("2026-07-27T10:00:00.000Z")
    });
    const context = contextFactory.create({
      identity: { actorId: "local-parent", tenantId: "local" },
      toolName: "gsc_list_sites"
    });

    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.allowedProperties)).toBe(true);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Reflect.set(profile, "accessMode", "operator")).toBe(false);
    expect(() => (profile.allowedProperties as string[]).push("sc-domain:other.example")).toThrow();
    expect(context).toEqual({
      requestId: "request-1",
      actorId: "local-parent",
      tenantId: "local",
      deploymentProfile: "local-stdio",
      accessMode: "read_only",
      transport: "stdio",
      startedAt: "2026-07-27T10:00:00.000Z",
      totalDeadlineMs: 30_000
    });
  });

  it.each([
    ["operator mode", { ...PROFILE_INPUT, accessMode: "operator" }],
    ["full-admin mode", { ...PROFILE_INPUT, accessMode: "full_admin" }],
    ["local operator profile", { ...PROFILE_INPUT, deploymentProfile: "local-operator" }],
    [
      "remote profile",
      { ...PROFILE_INPUT, deploymentProfile: "remote-oidc", transport: "http" }
    ],
    [
      "missing mode",
      (() => {
        const input: Record<string, unknown> = { ...PROFILE_INPUT };
        Reflect.deleteProperty(input, "accessMode");
        return input;
      })()
    ]
  ])("rejects the unsupported %s profile matrix entry", (_label, input) => {
    expect(() => createDeploymentProfile(input)).toThrow();
  });

  it("rejects empty, duplicate, and malformed exact allowlists", () => {
    expect(() => createDeploymentProfile({ ...PROFILE_INPUT, allowedProperties: [] })).toThrow();
    expect(() =>
      createDeploymentProfile({
        ...PROFILE_INPUT,
        allowedProperties: ["https://example.com/", "https://example.com/"]
      })
    ).toThrow(/normalized collision/i);
    expect(() => createDeploymentProfile({ ...PROFILE_INPUT, allowedProperties: [""] })).toThrow();
  });
});

describe("versioned capability registry", () => {
  it("preserves the frozen WP-01 capability-manifest fixture byte-for-byte", () => {
    const fixtureBytes = readFileSync(WP_01_MANIFEST_FIXTURE);

    expect(createHash("sha256").update(fixtureBytes).digest("hex")).toBe(
      WP_01_MANIFEST_FIXTURE_SHA256
    );
  });

  it("matches the reviewed-current WP-02 capability-manifest fixture", () => {
    const fixture = JSON.parse(readFileSync(WP_02_MANIFEST_FIXTURE, "utf8")) as unknown;

    expect(currentCapabilityManifest()).toEqual(fixture);
  });

  it("matches the reviewed-current WP-02 deterministic budget fixture", () => {
    const fixture = JSON.parse(readFileSync(WP_02_BUDGET_FIXTURE, "utf8")) as unknown;

    expect(currentBudgetProfiles()).toEqual(fixture);
  });

  it("is the single frozen truth table for the four containment reads", () => {
    expect(GSC_TOOL_NAMES).toEqual([
      "gsc_list_sites",
      "gsc_search_analytics",
      "gsc_list_sitemaps",
      "gsc_inspect_url"
    ]);
    expect(gscCapabilityRegistry.listForProfile("local-stdio:read_only").map((entry) => entry.name)).toEqual(
      GSC_TOOL_NAMES
    );
    expect(gscCapabilityRegistry.listForProfile("remote-oidc:read_only" as never)).toEqual([]);
    expect(Object.keys(GSC_TOOL_SCHEMA_CONTRACTS)).toEqual(GSC_TOOL_NAMES);
    expect(new Set(GSC_TOOL_NAMES).size).toBe(GSC_TOOL_NAMES.length);

    for (const capability of gscCapabilityRegistry.active) {
      expect(Object.isFrozen(capability)).toBe(true);
      expect(Object.isFrozen(capability.requiredGoogleScopes)).toBe(true);
      expect(Object.isFrozen(capability.requiredPropertyRoles)).toBe(true);
      expect(Object.isFrozen(capability.profileModes)).toBe(true);
      expect(Object.isFrozen(capability.resourceScope)).toBe(true);
      expect(Object.isFrozen(capability.annotations)).toBe(true);
      expect(capability.profileModes).toEqual(["local-stdio:read_only"]);
      expect(capability.effect).toBe("read");
      expect(capability.autonomyClass).toBe("bounded-read");
      expect(capability.approvalClass).toBe("none");
    }
  });

  it("uses pinned-Discovery Google method identifiers", () => {
    expect(
      Object.fromEntries(gscCapabilityRegistry.active.map((entry) => [entry.name, entry.googleMethod]))
    ).toEqual({
      gsc_list_sites: "webmasters.sites.list",
      gsc_search_analytics: "webmasters.searchanalytics.query",
      gsc_list_sitemaps: "webmasters.sitemaps.list",
      gsc_inspect_url: "searchconsole.urlInspection.index.inspect"
    });
  });

  it("uses exact Map lookup semantics for hostile and ambiguous names", () => {
    expect(gscCapabilityRegistry.lookupActive("gsc_list_sites")?.name).toBe("gsc_list_sites");
    for (const name of [
      "__proto__",
      "constructor",
      "GSC_LIST_SITES",
      " gsc_list_sites",
      "gsc_list_sites ",
      "gsc-list-sites"
    ]) {
      expect(gscCapabilityRegistry.lookupActive(name)).toBeUndefined();
      expect(gscCapabilityRegistry.lookupUnsupported(name)).toBeUndefined();
    }
  });

  it("rejects duplicate and cross-ledger capability names", () => {
    const active = gscCapabilityRegistry.active[0];
    const unsupported = GSC_UNSUPPORTED_CAPABILITIES[0];
    expect(active).toBeDefined();
    expect(unsupported).toBeDefined();

    expect(() =>
      createCapabilityRegistry({
        version: "duplicate-active",
        active: [active!, active!],
        unsupported: []
      })
    ).toThrow(/duplicate capability/i);
    expect(() =>
      createCapabilityRegistry({
        version: "cross-ledger",
        active: [active!],
        unsupported: [{ ...unsupported!, name: active!.name }]
      })
    ).toThrow(/duplicate capability/i);
  });

  it("keeps an explicit stable frozen unsupported-capability ledger", () => {
    expect(
      GSC_UNSUPPORTED_CAPABILITIES.map(({ name, effect, reasonCode, reconsiderAfter }) => ({
        name,
        effect,
        reasonCode,
        reconsiderAfter
      }))
    ).toEqual([
      {
        name: "gsc_submit_sitemap",
        effect: "mutation",
        reasonCode: "wp-00-containment",
        reconsiderAfter: "WP-09"
      },
      {
        name: "gsc_find_declining_pages",
        effect: "read",
        reasonCode: "wp-00-containment",
        reconsiderAfter: "WP-07"
      },
      {
        name: "gsc_find_keyword_opportunities",
        effect: "read",
        reasonCode: "wp-00-containment",
        reconsiderAfter: "WP-07"
      }
    ]);
    expect(Object.isFrozen(GSC_UNSUPPORTED_CAPABILITIES)).toBe(true);
    expect(GSC_UNSUPPORTED_CAPABILITIES.every(Object.isFrozen)).toBe(true);
  });
});
