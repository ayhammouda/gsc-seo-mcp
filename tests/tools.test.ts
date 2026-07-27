import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createContainedGscMcpServer } from "../src/app/bootstrap.js";
import {
  createCapabilityDispatcher,
  createCapabilityRegistry,
  createDeploymentProfile,
  createEphemeralAuditPort,
  createExactPropertyAllowlistPolicy,
  createGscServiceExecutorPort,
  createPassThroughBudgetPort,
  createRedactingCallToolResultErrorPort,
  createRequestContextFactory,
  GSC_TOOL_NAMES,
  gscCapabilityRegistry
} from "../src/kernel/index.js";
import { createGscMcpServer } from "../src/mcp-server.js";
import type { GscService } from "../src/types.js";

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
    searchAnalytics: vi.fn(() => Promise.resolve({ rows: [], note: "Results are sorted by clicks." })),
    listSitemaps: vi.fn(() => Promise.resolve({ sitemaps: [] })),
    inspectUrl: vi.fn(() => Promise.resolve({ indexStatus: {} }))
  };
}

function createServer(getService: () => GscService = fakeService) {
  return createContainedGscMcpServer({
    mode: "read_only",
    allowedProperties: [ALLOWED_PROPERTY],
    requestTimeoutMs: 30_000,
    totalDeadlineMs: 45_000,
    getService
  });
}

async function withClient<T>(
  server: ReturnType<typeof createServer>,
  run: (client: Client) => Promise<T>
): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "tools-test", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function withObservableAudit(getService: () => GscService = fakeService) {
  const profile = createDeploymentProfile({
    profileId: "audit-coverage",
    deploymentProfile: "local-stdio",
    accessMode: "read_only",
    transport: "stdio",
    allowedProperties: [ALLOWED_PROPERTY],
    totalDeadlineMs: 45_000
  });
  const identity = { actorId: "local-parent-process", tenantId: "local" };
  const audit = createEphemeralAuditPort();
  const dispatcher = createCapabilityDispatcher({
    registry: gscCapabilityRegistry,
    profile,
    contextFactory: createRequestContextFactory({ profile }),
    staticPolicy: createExactPropertyAllowlistPolicy({
      allowedProperties: profile.allowedProperties,
      expectedIdentity: identity
    }),
    budget: createPassThroughBudgetPort(),
    executor: createGscServiceExecutorPort(getService),
    errors: createRedactingCallToolResultErrorPort(),
    audit
  });

  return { audit, server: createGscMcpServer({ dispatcher, identity }) };
}

describe("terminal audit coverage over MCP", () => {
  it("audits a cross-property inspection attempt", async () => {
    const { audit, server } = withObservableAudit();

    const result = await withClient(server, (client) =>
      client.callTool({
        name: "gsc_inspect_url",
        arguments: {
          site_url: ALLOWED_PROPERTY,
          inspection_url: "https://evil.example.net/x"
        }
      })
    );

    expect(result.isError).toBe(true);
    expect(audit.snapshot()).toHaveLength(1);
    expect(audit.snapshot()[0]).toMatchObject({
      tool: "gsc_inspect_url",
      resultCode: "resource_containment_denied"
    });
  });

  it("audits a non-allowlisted property attempt", async () => {
    const { audit, server } = withObservableAudit();

    await withClient(server, (client) =>
      client.callTool({ name: "gsc_list_sitemaps", arguments: { site_url: DENIED_PROPERTY } })
    );

    expect(audit.snapshot()).toHaveLength(1);
    expect(audit.snapshot()[0]).toMatchObject({
      tool: "gsc_list_sitemaps",
      policyDecision: "deny",
      resultCode: "policy_denied"
    });
  });
});

describe("manifest-driven MCP tools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers exactly the capabilities visible to local-stdio read_only", async () => {
    const tools = await withClient(createServer(), (client) => client.listTools());
    const expected = gscCapabilityRegistry.listForProfile("local-stdio:read_only");

    expect(tools.tools.map((tool) => tool.name)).toEqual(GSC_TOOL_NAMES);
    expect(tools.tools.map((tool) => tool.name)).toEqual(expected.map((capability) => capability.name));
    expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });

  it("registers and dispatches from the same branded kernel manifest", async () => {
    const baseCapability = gscCapabilityRegistry.active[0];
    if (!baseCapability) throw new Error("Expected the list-sites capability fixture");
    const syntheticCapability = {
      ...baseCapability,
      name: "synthetic_account_inventory",
      title: "Synthetic Account Inventory",
      resourceScope: { kind: "account" as const, filterOutputByAllowedProperties: true as const }
    };
    const registry = createCapabilityRegistry({
      version: "synthetic-registration-parity",
      active: [syntheticCapability],
      unsupported: []
    });
    const profile = createDeploymentProfile({
      profileId: "synthetic",
      deploymentProfile: "local-stdio",
      accessMode: "read_only",
      transport: "stdio",
      allowedProperties: [ALLOWED_PROPERTY],
      totalDeadlineMs: 45_000
    });
    const identity = { actorId: "synthetic-parent", tenantId: "local" };
    const dispatcher = createCapabilityDispatcher({
      registry,
      profile,
      contextFactory: createRequestContextFactory({
        profile,
        createRequestId: () => "synthetic-request"
      }),
      staticPolicy: createExactPropertyAllowlistPolicy({
        allowedProperties: profile.allowedProperties,
        expectedIdentity: identity
      }),
      budget: createPassThroughBudgetPort(),
      executor: {
        execute: () =>
          Promise.resolve({
            sites: [
              { siteUrl: ALLOWED_PROPERTY, permissionLevel: "siteOwner" },
              { siteUrl: DENIED_PROPERTY, permissionLevel: "siteOwner" }
            ]
          })
      },
      errors: createRedactingCallToolResultErrorPort(),
      audit: createEphemeralAuditPort()
    });
    const server = createGscMcpServer({ dispatcher, identity });

    await withClient(server, async (client) => {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual(["synthetic_account_inventory"]);

      const result = await client.callTool({
        name: "synthetic_account_inventory",
        arguments: {}
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual({
        sites: [{ siteUrl: ALLOWED_PROPERTY, permissionLevel: "siteOwner" }]
      });
    });
  });

  it("rejects invalid profiles before obtaining the lazy service", () => {
    const getService = vi.fn(fakeService);

    expect(() =>
      createContainedGscMcpServer({
        mode: "operator",
        allowedProperties: [ALLOWED_PROPERTY],
        requestTimeoutMs: 30_000,
        totalDeadlineMs: 45_000,
        getService
      })
    ).toThrow(/only read_only/i);
    expect(() =>
      createContainedGscMcpServer({
        mode: "read_only",
        allowedProperties: [],
        requestTimeoutMs: 30_000,
        totalDeadlineMs: 45_000,
        getService
      })
    ).toThrow();
    expect(() =>
      createContainedGscMcpServer({
        mode: "read_only",
        allowedProperties: [ALLOWED_PROPERTY],
        requestTimeoutMs: 30_001,
        totalDeadlineMs: 45_000,
        getService
      })
    ).toThrow(/attempt timeout/i);
    expect(() =>
      createContainedGscMcpServer({
        mode: "read_only",
        allowedProperties: [ALLOWED_PROPERTY],
        requestTimeoutMs: 30_000,
        totalDeadlineMs: 45_001,
        getService
      })
    ).toThrow();
    expect(getService).not.toHaveBeenCalled();
  });

  it("filters site inventory at the dispatcher result boundary", async () => {
    const result = await withClient(createServer(), (client) =>
      client.callTool({ name: "gsc_list_sites", arguments: {} })
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      sites: [{ siteUrl: ALLOWED_PROPERTY, permissionLevel: "siteOwner" }]
    });
  });

  it("denies a disallowed property before obtaining the lazy service", async () => {
    const getService = vi.fn(fakeService);
    const result = await withClient(createServer(getService), (client) =>
      client.callTool({
        name: "gsc_list_sitemaps",
        arguments: { site_url: DENIED_PROPERTY }
      })
    );

    expect(result.isError).toBe(true);
    expect(getService).not.toHaveBeenCalled();
  });

  it("authorizes normalized aliases but sends only the configured property identity upstream", async () => {
    const configuredProperty = "HTTPS://EXAMPLE.COM:443/";
    const searchAnalytics = vi.fn<GscService["searchAnalytics"]>(() =>
      Promise.resolve({ rows: [], note: "Results are sorted by clicks." })
    );
    const service: GscService = {
      ...fakeService(),
      searchAnalytics
    };
    const server = createContainedGscMcpServer({
      mode: "read_only",
      allowedProperties: [configuredProperty],
      requestTimeoutMs: 30_000,
      totalDeadlineMs: 45_000,
      getService: () => service
    });

    const result = await withClient(server, (client) =>
      client.callTool({
        name: "gsc_search_analytics",
        arguments: {
          site_url: "https://example.com/",
          start_date: "2026-01-01",
          end_date: "2026-01-01"
        }
      })
    );

    expect(result.isError).not.toBe(true);
    expect(searchAnalytics).toHaveBeenCalledOnce();
    expect(searchAnalytics.mock.calls[0]?.[0]).toMatchObject({
      site_url: configuredProperty
    });
  });

  it("does not register or dispatch unsupported mutation and derived capabilities", async () => {
    const getService = vi.fn(fakeService);
    const server = createServer(getService);

    await withClient(server, async (client) => {
      const listed = await client.listTools();
      for (const unsupported of gscCapabilityRegistry.unsupported) {
        expect(listed.tools.map((tool) => tool.name)).not.toContain(unsupported.name);
        const result = await client.callTool({ name: unsupported.name, arguments: {} });
        expect(result.isError).toBe(true);
      }
    });

    expect(getService).not.toHaveBeenCalled();
  });

  it("requires the dispatcher, profile, and caller identity at MCP construction", () => {
    expect(() =>
      createGscMcpServer({
        dispatcher: undefined as never,
        identity: undefined as never
      })
    ).toThrow(/dispatcher/i);
    expect(() =>
      createGscMcpServer({
        dispatcher: {
          dispatch: () =>
            Promise.resolve({
              content: [{ type: "text", text: "structurally similar but untrusted" }]
            })
        },
        identity: undefined as never
      })
    ).toThrow(/dispatcher/i);
  });
});
