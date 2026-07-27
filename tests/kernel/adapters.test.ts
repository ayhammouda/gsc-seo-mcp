import { describe, expect, it, vi } from "vitest";
import {
  createCapabilityDispatcher,
  createDeploymentProfile,
  createEphemeralAuditPort,
  createExactPropertyAllowlistPolicy,
  createGscServiceExecutorPort,
  createPassThroughBudgetPort,
  createRedactingCallToolResultErrorPort,
  createRequestContextFactory,
  GSC_TOOL_NAMES,
  GSC_UNSUPPORTED_CAPABILITIES,
  gscCapabilityRegistry
} from "../../src/kernel/index.js";
import type { GscService } from "../../src/types.js";

const ALLOWED_PROPERTY = "https://example.com/";
const DENIED_PROPERTY = "sc-domain:other.example";

function fakeService(): GscService {
  return {
    listSites: vi.fn(() =>
      Promise.resolve({
        sites: [
          { siteUrl: ALLOWED_PROPERTY, permissionLevel: "siteOwner" },
          { siteUrl: DENIED_PROPERTY, permissionLevel: "siteOwner" }
        ]
      })
    ),
    searchAnalytics: vi.fn(() => Promise.resolve({ rows: [], note: "bounded" })),
    listSitemaps: vi.fn(() => Promise.resolve({ sitemaps: [] })),
    inspectUrl: vi.fn(() => Promise.resolve({ indexStatus: {} }))
  };
}

function createContainedDispatcher(serviceProvider: () => GscService | Promise<GscService>) {
  const profile = createDeploymentProfile({
    profileId: "contained",
    deploymentProfile: "local-stdio",
    accessMode: "read_only",
    transport: "stdio",
    allowedProperties: [ALLOWED_PROPERTY],
    totalDeadlineMs: 30_000
  });
  const audit = createEphemeralAuditPort();
  const executor = createGscServiceExecutorPort(serviceProvider);
  return {
    audit,
    executor,
    dispatcher: createCapabilityDispatcher({
      registry: gscCapabilityRegistry,
      profile,
      contextFactory: createRequestContextFactory({
        profile,
        createRequestId: () => "request-1"
      }),
      staticPolicy: createExactPropertyAllowlistPolicy({
        allowedProperties: profile.allowedProperties,
        expectedIdentity: identity
      }),
      budget: createPassThroughBudgetPort(),
      executor,
      errors: createRedactingCallToolResultErrorPort(),
      audit
    })
  };
}

const identity = { actorId: "local-parent", tenantId: "local" };

describe("WP-00 compatibility adapters", () => {
  it("bounds ephemeral audit retention", async () => {
    const audit = createEphemeralAuditPort({ maxEvents: 2 });
    const auditProfile = createDeploymentProfile({
      profileId: "audit-bound",
      deploymentProfile: "local-stdio",
      accessMode: "read_only",
      transport: "stdio",
      allowedProperties: [ALLOWED_PROPERTY],
      totalDeadlineMs: 30_000
    });
    const dispatcher = createCapabilityDispatcher({
      registry: gscCapabilityRegistry,
      profile: auditProfile,
      contextFactory: createRequestContextFactory({
        profile: auditProfile,
        createRequestId: (() => {
          let request = 0;
          return () => `request-${++request}`;
        })()
      }),
      staticPolicy: createExactPropertyAllowlistPolicy({
        allowedProperties: [ALLOWED_PROPERTY],
        expectedIdentity: identity
      }),
      budget: createPassThroughBudgetPort(),
      executor: createGscServiceExecutorPort(fakeService),
      errors: createRedactingCallToolResultErrorPort(),
      audit
    });

    await dispatcher.dispatch({ toolName: "gsc_list_sites", input: {}, identity });
    await dispatcher.dispatch({ toolName: "gsc_list_sites", input: {}, identity });
    await dispatcher.dispatch({ toolName: "gsc_list_sites", input: {}, identity });

    expect(audit.snapshot().map((event) => event.requestId)).toEqual(["request-2", "request-3"]);
  });

  it("filters account inventory through the exact allowlist after lazy execution", async () => {
    const service = fakeService();
    const provider = vi.fn(() => service);
    const { audit, dispatcher } = createContainedDispatcher(provider);

    const result = await dispatcher.dispatch({
      toolName: "gsc_list_sites",
      input: {},
      identity
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      sites: [{ siteUrl: ALLOWED_PROPERTY, permissionLevel: "siteOwner" }]
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "Returned 1 Search Console site."
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(audit.snapshot()).toHaveLength(1);
  });

  it("drives account inventory filtering from resource metadata rather than a tool name", async () => {
    const profile = createDeploymentProfile({
      profileId: "metadata-filter",
      deploymentProfile: "local-stdio",
      accessMode: "read_only",
      transport: "stdio",
      allowedProperties: [ALLOWED_PROPERTY],
      totalDeadlineMs: 30_000
    });
    const context = createRequestContextFactory({
      profile,
      createRequestId: () => "metadata-filter-request"
    }).create({ identity, toolName: "synthetic_account_inventory" });
    const baseCapability = gscCapabilityRegistry.active[0];
    if (!baseCapability) throw new Error("Expected the list-sites capability fixture");
    const capability = {
      ...baseCapability,
      name: "synthetic_account_inventory",
      resourceScope: { kind: "account" as const, filterOutputByAllowedProperties: true as const }
    };
    const policy = createExactPropertyAllowlistPolicy({
      allowedProperties: profile.allowedProperties,
      expectedIdentity: identity
    });

    const filtered = await policy.filterOutput({
      context,
      capability,
      resource: { kind: "account" },
      output: {
        sites: [
          { siteUrl: ALLOWED_PROPERTY, permissionLevel: "siteOwner" },
          { siteUrl: DENIED_PROPERTY, permissionLevel: "siteOwner" }
        ]
      }
    });

    expect(filtered).toEqual({
      sites: [{ siteUrl: ALLOWED_PROPERTY, permissionLevel: "siteOwner" }]
    });
  });

  it("denies a disallowed property before lazy service construction", async () => {
    const provider = vi.fn(() => fakeService());
    const { audit, dispatcher } = createContainedDispatcher(provider);

    const result = await dispatcher.dispatch({
      toolName: "gsc_list_sitemaps",
      input: { site_url: DENIED_PROPERTY },
      identity
    });

    expect(result.isError).toBe(true);
    expect(provider).not.toHaveBeenCalled();
    expect(audit.snapshot()).toHaveLength(1);
    expect(audit.snapshot()[0]).toMatchObject({
      policyDecision: "deny",
      budgetOutcome: "not-reached",
      resultCode: "policy_denied"
    });
  });

  it("denies an unexpected local identity before lazy service construction", async () => {
    const provider = vi.fn(() => fakeService());
    const { audit, dispatcher } = createContainedDispatcher(provider);

    const result = await dispatcher.dispatch({
      toolName: "gsc_list_sites",
      input: {},
      identity: { actorId: "different-parent", tenantId: "local" }
    });

    expect(result.isError).toBe(true);
    expect(provider).not.toHaveBeenCalled();
    expect(audit.snapshot()[0]).toMatchObject({
      policyDecision: "deny",
      budgetOutcome: "not-reached",
      resultCode: "policy_denied"
    });
  });

  it("maps exactly the active read capabilities and exposes no submit executor", () => {
    const executor = createGscServiceExecutorPort(() => fakeService());

    expect(executor.supportedTools).toEqual(GSC_TOOL_NAMES);
    expect(executor.supportedTools).not.toContain("gsc_submit_sitemap");
    expect(Object.isFrozen(executor.supportedTools)).toBe(true);
  });

  it("keeps every unsupported capability outside policy, budget, and execution", async () => {
    const provider = vi.fn(() => fakeService());
    const { audit, dispatcher } = createContainedDispatcher(provider);

    for (const capability of GSC_UNSUPPORTED_CAPABILITIES) {
      const result = await dispatcher.dispatch({
        toolName: capability.name,
        input: {},
        identity
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: `${capability.name} is unsupported: ${capability.reasonCode}`
      });
    }

    expect(provider).not.toHaveBeenCalled();
    expect(audit.snapshot()).toHaveLength(GSC_UNSUPPORTED_CAPABILITIES.length);
    expect(audit.snapshot().every((event) => event.resultCode === "unsupported_capability")).toBe(true);
  });
});
