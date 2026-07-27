import { describe, expect, it } from "vitest";
import {
  assertCapabilityInputWithinBudget,
  CAPABILITY_CONCURRENCY_UNITS,
  DEFAULT_CAPABILITY_BUDGETS,
  MAX_ACTOR_CONCURRENCY,
  MAX_ALLOWLIST_ENTRIES,
  MAX_ANALYTICS_ROWS_PER_REQUEST,
  MAX_ANALYTICS_WINDOW_ROWS,
  MAX_CAPABILITY_INPUT_BYTES,
  MAX_CAPABILITY_OUTPUT_BYTES,
  MAX_FILTER_GROUPS,
  MAX_FILTERS_PER_GROUP,
  MAX_GATEWAY_OPERATIONS,
  MAX_LANGUAGE_CODE_LENGTH,
  MAX_OUTPUT_DEPTH,
  MAX_OUTPUT_NODES,
  MAX_PROCESS_CONCURRENCY,
  MAX_PROPERTY_CONCURRENCY,
  MAX_PROPERTY_OR_URL_BYTES,
  READ_ATTEMPT_TIMEOUT_MS,
  READ_TOTAL_DEADLINE_MS,
  validateCapabilityBudget
} from "../../src/kernel/budget-limits.js";
import type {
  BudgetLimitCode,
  CapabilityBudget
} from "../../src/kernel/budget-limits.js";
import { createInMemoryBudgetPort } from "../../src/kernel/in-memory-budget.js";
import { gscCapabilityRegistry } from "../../src/kernel/manifest.js";
import type { CapabilityDefinition } from "../../src/kernel/manifest.js";
import type {
  BudgetLease,
  BudgetPort,
  NormalizedCapabilityResource
} from "../../src/kernel/ports.js";
import type { RequestContext } from "../../src/kernel/profile.js";
import { parseSearchConsoleProperty } from "../../src/resources/index.js";

const encoder = new TextEncoder();
function requireCapability(name: string): CapabilityDefinition {
  const capability = gscCapabilityRegistry.lookupActive(name);
  if (!capability) {
    throw new Error(`Expected contained capability fixture: ${name}`);
  }
  return capability;
}

function assertNormalizedInput(capability: CapabilityDefinition, input: unknown): void {
  const capabilityBudget = DEFAULT_CAPABILITY_BUDGETS[capability.name];
  if (!capabilityBudget) {
    throw new Error(`Expected deterministic budget fixture: ${capability.name}`);
  }
  assertCapabilityInputWithinBudget(capability, input, capabilityBudget);
}

const listSitesCapability = requireCapability("gsc_list_sites");
const analyticsCapability = requireCapability("gsc_search_analytics");
const listSitemapsCapability = requireCapability("gsc_list_sitemaps");
const inspectCapability = requireCapability("gsc_inspect_url");

function budget(overrides: Partial<CapabilityBudget> = {}): CapabilityBudget {
  return validateCapabilityBudget({
    profileId: listSitesCapability.budgetProfile,
    maxInputBytes: MAX_CAPABILITY_INPUT_BYTES,
    maxOutputBytes: MAX_CAPABILITY_OUTPUT_BYTES,
    primaryOutput: "sites",
    maxOutputItems: MAX_ALLOWLIST_ENTRIES,
    maxOutputDepth: MAX_OUTPUT_DEPTH,
    maxOutputNodes: MAX_OUTPUT_NODES,
    maxGatewayOperations: MAX_GATEWAY_OPERATIONS,
    concurrencyUnits: CAPABILITY_CONCURRENCY_UNITS,
    ...overrides
  });
}

function listSitesPort(customBudget = budget()): BudgetPort {
  return createInMemoryBudgetPort({
    capabilityBudgets: { gsc_list_sites: customBudget }
  });
}

function context(actorId = "actor-1", requestId = `request-${actorId}`): RequestContext {
  return {
    requestId,
    actorId,
    tenantId: "tenant-1",
    deploymentProfile: "local-stdio",
    accessMode: "read_only",
    transport: "stdio",
    startedAt: "2026-07-27T00:00:00.000Z",
    totalDeadlineMs: READ_TOTAL_DEADLINE_MS
  };
}

function accountResource(): NormalizedCapabilityResource {
  return { kind: "account" };
}

function propertyResource(
  fixtureName: string,
  apiValue = `https://${fixtureName}.example/`
): NormalizedCapabilityResource {
  return {
    kind: "property",
    property: parseSearchConsoleProperty(apiValue)
  };
}

function expectBudgetCode(operation: () => unknown, code: BudgetLimitCode): void {
  expect(operation).toThrow(expect.objectContaining({ code }));
}

async function expectBudgetRejection(
  operation: Promise<unknown>,
  code: BudgetLimitCode
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code });
}

async function reserve(
  port: BudgetPort,
  actorId: string,
  resource: NormalizedCapabilityResource = propertyResource("property-1"),
  requestId = `request-${actorId}`
): Promise<BudgetLease> {
  return port.reserve({
    context: context(actorId, requestId),
    capability: listSitesCapability,
    resource,
    input: {}
  });
}

describe("deterministic capability budget configuration", () => {
  it("pins and freezes every WP-02 hard limit", () => {
    expect({
      MAX_CAPABILITY_INPUT_BYTES,
      MAX_CAPABILITY_OUTPUT_BYTES,
      MAX_ANALYTICS_ROWS_PER_REQUEST,
      MAX_ANALYTICS_WINDOW_ROWS,
      MAX_FILTER_GROUPS,
      MAX_FILTERS_PER_GROUP,
      MAX_PROPERTY_OR_URL_BYTES,
      MAX_LANGUAGE_CODE_LENGTH,
      MAX_ALLOWLIST_ENTRIES,
      MAX_OUTPUT_DEPTH,
      MAX_OUTPUT_NODES,
      MAX_GATEWAY_OPERATIONS,
      CAPABILITY_CONCURRENCY_UNITS,
      MAX_ACTOR_CONCURRENCY,
      MAX_PROPERTY_CONCURRENCY,
      MAX_PROCESS_CONCURRENCY,
      READ_TOTAL_DEADLINE_MS,
      READ_ATTEMPT_TIMEOUT_MS
    }).toEqual({
      MAX_CAPABILITY_INPUT_BYTES: 262_144,
      MAX_CAPABILITY_OUTPUT_BYTES: 1_048_576,
      MAX_ANALYTICS_ROWS_PER_REQUEST: 1_000,
      MAX_ANALYTICS_WINDOW_ROWS: 25_000,
      MAX_FILTER_GROUPS: 4,
      MAX_FILTERS_PER_GROUP: 8,
      MAX_PROPERTY_OR_URL_BYTES: 8_192,
      MAX_LANGUAGE_CODE_LENGTH: 35,
      MAX_ALLOWLIST_ENTRIES: 1_000,
      MAX_OUTPUT_DEPTH: 32,
      MAX_OUTPUT_NODES: 50_000,
      MAX_GATEWAY_OPERATIONS: 1,
      CAPABILITY_CONCURRENCY_UNITS: 1,
      MAX_ACTOR_CONCURRENCY: 2,
      MAX_PROPERTY_CONCURRENCY: 4,
      MAX_PROCESS_CONCURRENCY: 8,
      READ_TOTAL_DEADLINE_MS: 45_000,
      READ_ATTEMPT_TIMEOUT_MS: 30_000
    });
    expect(Object.isFrozen(DEFAULT_CAPABILITY_BUDGETS)).toBe(true);
    expect(Object.values(DEFAULT_CAPABILITY_BUDGETS).every(Object.isFrozen)).toBe(true);
    expect(DEFAULT_CAPABILITY_BUDGETS).toMatchObject({
      gsc_list_sites: {
        profileId: "gsc-list-sites-contained",
        primaryOutput: "sites",
        maxOutputItems: 1_000
      },
      gsc_search_analytics: {
        profileId: "gsc-search-analytics-contained",
        primaryOutput: "rows",
        maxOutputItems: 1_000
      },
      gsc_list_sitemaps: {
        profileId: "gsc-list-sitemaps-contained",
        primaryOutput: "sitemaps",
        maxOutputItems: 1_000
      },
      gsc_inspect_url: {
        profileId: "gsc-url-inspection-contained",
        primaryOutput: "singleton",
        maxOutputItems: 1
      }
    });
  });

  it.each([
    null,
    {},
    { ...budget(), unexpected: true },
    { ...budget(), profileId: "Upper Case" },
    { ...budget(), primaryOutput: "pages" },
    { ...budget(), maxInputBytes: 0 },
    { ...budget(), maxInputBytes: MAX_CAPABILITY_INPUT_BYTES + 1 },
    { ...budget(), maxOutputBytes: MAX_CAPABILITY_OUTPUT_BYTES + 1 },
    { ...budget(), maxOutputDepth: MAX_OUTPUT_DEPTH + 1 },
    { ...budget(), maxOutputNodes: MAX_OUTPUT_NODES + 1 },
    { ...budget(), maxGatewayOperations: 2 },
    { ...budget(), concurrencyUnits: 2 },
    { ...budget(), primaryOutput: "singleton", maxOutputItems: 2 }
  ])("rejects malformed or elevated budget %#", (candidate) => {
    expectBudgetCode(
      () => validateCapabilityBudget(candidate),
      "budget_invalid_configuration"
    );
  });

  it("rejects unknown capabilities and manifest/profile mismatches", () => {
    const unknownCapability = { ...listSitesCapability, name: "gsc_unknown" };
    const port = listSitesPort();
    expectBudgetCode(
      () => port.assertInput({ capability: unknownCapability, input: {} }),
      "budget_unknown_capability"
    );

    const mismatched = { ...listSitesCapability, budgetProfile: "different-profile" };
    expectBudgetCode(
      () => port.assertInput({ capability: mismatched, input: {} }),
      "budget_profile_mismatch"
    );
  });
});

describe("input budgets", () => {
  it("accepts the exact UTF-8 JSON byte boundary and rejects one byte over", () => {
    const overhead = encoder.encode(JSON.stringify({ padding: "" })).byteLength;
    const exactInput = { padding: "x".repeat(MAX_CAPABILITY_INPUT_BYTES - overhead) };
    const overInput = { padding: `${exactInput.padding}x` };
    const port = listSitesPort();

    expect(encoder.encode(JSON.stringify(exactInput)).byteLength).toBe(MAX_CAPABILITY_INPUT_BYTES);
    expect(() => port.assertInput({ capability: listSitesCapability, input: exactInput })).not.toThrow();
    expectBudgetCode(
      () => port.assertInput({ capability: listSitesCapability, input: overInput }),
      "budget_input_bytes_exceeded"
    );
  });

  it("measures multibyte strings as UTF-8 rather than JavaScript code units", () => {
    const multibyteInput = { padding: "é" };
    const bytes = encoder.encode(JSON.stringify(multibyteInput)).byteLength;
    expect(JSON.stringify(multibyteInput).length).toBe(bytes - 1);

    const exactPort = listSitesPort(budget({ maxInputBytes: bytes }));
    expect(() =>
      exactPort.assertInput({ capability: listSitesCapability, input: multibyteInput })
    ).not.toThrow();
    const shortPort = listSitesPort(budget({ maxInputBytes: bytes - 1 }));
    expectBudgetCode(
      () => shortPort.assertInput({ capability: listSitesCapability, input: multibyteInput }),
      "budget_input_bytes_exceeded"
    );
  });

  it("enforces exact analytics window and filter boundaries", () => {
    const filter = { dimension: "query", operator: "equals", expression: "x" };
    const exactInput = {
      site_url: "https://example.com/",
      start_date: "2026-01-01",
      end_date: "2026-01-01",
      dimensions: [],
      row_limit: MAX_ANALYTICS_ROWS_PER_REQUEST,
      start_row: MAX_ANALYTICS_WINDOW_ROWS - MAX_ANALYTICS_ROWS_PER_REQUEST,
      filters: Array.from({ length: MAX_FILTER_GROUPS }, () => ({
        group_type: "and",
        filters: Array.from({ length: MAX_FILTERS_PER_GROUP }, () => filter)
      }))
    };

    expect(() => assertNormalizedInput(analyticsCapability, exactInput)).not.toThrow();
    expectBudgetCode(
      () =>
        assertNormalizedInput(analyticsCapability, {
          ...exactInput,
          row_limit: MAX_ANALYTICS_ROWS_PER_REQUEST + 1
        }),
      "budget_row_limit_exceeded"
    );
    expectBudgetCode(
      () =>
        assertNormalizedInput(analyticsCapability, {
          ...exactInput,
          start_row: exactInput.start_row + 1
        }),
      "budget_analytics_window_exceeded"
    );
    expectBudgetCode(
      () =>
        assertNormalizedInput(analyticsCapability, {
          ...exactInput,
          filters: [...exactInput.filters, { group_type: "and", filters: [filter] }]
        }),
      "budget_filter_groups_exceeded"
    );
    expectBudgetCode(
      () =>
        assertNormalizedInput(analyticsCapability, {
          ...exactInput,
          filters: [
            {
              group_type: "and",
              filters: [...exactInput.filters[0]!.filters, filter]
            }
          ]
        }),
      "budget_filters_per_group_exceeded"
    );
  });

  it("enforces property/URL UTF-8 bytes and language-code character limits", () => {
    const exactSite = "x".repeat(MAX_PROPERTY_OR_URL_BYTES);
    expect(() =>
      assertNormalizedInput(listSitemapsCapability, { site_url: exactSite })
    ).not.toThrow();
    expectBudgetCode(
      () =>
        assertNormalizedInput(listSitemapsCapability, { site_url: `${exactSite}x` }),
      "budget_property_or_url_bytes_exceeded"
    );
    expectBudgetCode(
      () =>
        assertNormalizedInput(listSitemapsCapability, {
          site_url: "é".repeat(MAX_PROPERTY_OR_URL_BYTES / 2 + 1)
        }),
      "budget_property_or_url_bytes_exceeded"
    );

    const exactLanguage = "x".repeat(MAX_LANGUAGE_CODE_LENGTH);
    expect(() =>
      assertNormalizedInput(inspectCapability, {
        site_url: "https://example.com/",
        inspection_url: "https://example.com/page",
        language_code: exactLanguage
      })
    ).not.toThrow();
    expectBudgetCode(
      () =>
        assertNormalizedInput(inspectCapability, {
          site_url: "https://example.com/",
          inspection_url: "https://example.com/page",
          language_code: `${exactLanguage}x`
        }),
      "budget_language_code_exceeded"
    );
  });

  it.each([
    undefined,
    { value: undefined },
    { value: 1n },
    { value: Number.NaN },
    { value: () => "nope" },
    new Date("2026-01-01T00:00:00.000Z")
  ])("rejects non-JSON input %#", (input) => {
    const port = listSitesPort();
    expectBudgetCode(
      () => port.assertInput({ capability: listSitesCapability, input }),
      "budget_input_not_json"
    );
  });

  it("reports input-specific depth and node limit failures", () => {
    const port = listSitesPort();
    let nested: unknown = null;
    for (let depth = 0; depth <= MAX_OUTPUT_DEPTH; depth += 1) {
      nested = { nested };
    }
    expectBudgetCode(
      () => port.assertInput({ capability: listSitesCapability, input: nested }),
      "budget_input_depth_exceeded"
    );

    const manyNodes = {
      values: Array.from({ length: MAX_OUTPUT_NODES }, () => null)
    };
    expect(encoder.encode(JSON.stringify(manyNodes)).byteLength).toBeLessThan(
      MAX_CAPABILITY_INPUT_BYTES
    );
    expectBudgetCode(
      () => port.assertInput({ capability: listSitesCapability, input: manyNodes }),
      "budget_input_nodes_exceeded"
    );
  });
});

describe("output budgets", () => {
  it("accepts the exact UTF-8 output byte and item boundaries", () => {
    const exact = { sites: ["é"] };
    const bytes = encoder.encode(JSON.stringify(exact)).byteLength;
    const exactPort = listSitesPort(
      budget({ maxOutputBytes: bytes, maxOutputItems: 1 })
    );
    expect(() =>
      exactPort.assertOutput({
        context: context(),
        capability: listSitesCapability,
        resource: accountResource(),
        output: exact
      })
    ).not.toThrow();

    const byteShortPort = listSitesPort(
      budget({ maxOutputBytes: bytes - 1, maxOutputItems: 1 })
    );
    expectBudgetCode(
      () =>
        byteShortPort.assertOutput({
          context: context(),
          capability: listSitesCapability,
          resource: accountResource(),
          output: exact
        }),
      "budget_output_bytes_exceeded"
    );

    const itemPort = listSitesPort(budget({ maxOutputItems: 1 }));
    expectBudgetCode(
      () =>
        itemPort.assertOutput({
          context: context(),
          capability: listSitesCapability,
          resource: accountResource(),
          output: { sites: ["one", "two"] }
        }),
      "budget_output_items_exceeded"
    );
  });

  it("enforces depth and node boundaries with root depth zero", () => {
    const depthPort = listSitesPort(
      budget({ maxOutputDepth: 2, maxOutputNodes: 10 })
    );
    expect(() =>
      depthPort.assertOutput({
        context: context(),
        capability: listSitesCapability,
        resource: accountResource(),
        output: { sites: ["at-depth-two"] }
      })
    ).not.toThrow();
    expectBudgetCode(
      () =>
        depthPort.assertOutput({
          context: context(),
          capability: listSitesCapability,
          resource: accountResource(),
          output: { sites: [{ nested: true }] }
        }),
      "budget_output_depth_exceeded"
    );

    const nodePort = listSitesPort(
      budget({ maxOutputDepth: 2, maxOutputNodes: 4, maxOutputItems: 2 })
    );
    expect(() =>
      nodePort.assertOutput({
        context: context(),
        capability: listSitesCapability,
        resource: accountResource(),
        output: { sites: ["one", "two"] }
      })
    ).not.toThrow();
    expectBudgetCode(
      () =>
        nodePort.assertOutput({
          context: context(),
          capability: listSitesCapability,
          resource: accountResource(),
          output: { sites: ["one", "two", "three"] }
        }),
      "budget_output_nodes_exceeded"
    );
  });

  it("rejects cycles, accessors, sparse arrays, custom prototypes, and non-JSON values", () => {
    const port = listSitesPort();
    const cycle: Record<string, unknown> = { sites: [] };
    cycle.self = cycle;
    const accessor = { sites: [] as unknown[] };
    Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
    const sparse = new Array<unknown>(1);
    const custom = Object.create({ inherited: true }) as Record<string, unknown>;
    custom.sites = [];

    for (const output of [
      cycle,
      accessor,
      { sites: sparse },
      custom,
      { sites: [undefined] },
      { sites: [1n] },
      { sites: [Number.POSITIVE_INFINITY] }
    ]) {
      expectBudgetCode(
        () =>
          port.assertOutput({
            context: context(),
            capability: listSitesCapability,
            resource: accountResource(),
            output
          }),
        "budget_output_not_json"
      );
    }
  });

  it("does not invoke array getters or object toJSON hooks while inspecting strict JSON", () => {
    const port = listSitesPort();
    let getterCalls = 0;
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, "0", {
      enumerable: true,
      configurable: true,
      get: () => {
        getterCalls += 1;
        return "unexpected";
      }
    });
    let toJsonCalls = 0;
    const toJsonOutput = { sites: [] as unknown[] };
    Object.defineProperty(toJsonOutput, "toJSON", {
      enumerable: false,
      configurable: true,
      value: () => {
        toJsonCalls += 1;
        return { sites: [] };
      }
    });

    expectBudgetCode(
      () =>
        port.assertInput({
          capability: listSitesCapability,
          input: { values: accessorArray }
        }),
      "budget_input_not_json"
    );
    expectBudgetCode(
      () =>
        port.assertRawOutput({
          context: context(),
          capability: listSitesCapability,
          resource: accountResource(),
          output: toJsonOutput
        }),
      "budget_output_not_json"
    );
    expect(getterCalls).toBe(0);
    expect(toJsonCalls).toBe(0);
  });

  it("rejects proxies without invoking their traps", () => {
    const port = listSitesPort();
    let trapCalls = 0;
    const proxy = new Proxy(
      { value: "unexpected" },
      {
        ownKeys: () => {
          trapCalls += 1;
          return ["value"];
        },
        getOwnPropertyDescriptor: () => {
          trapCalls += 1;
          return {
            value: "unexpected",
            enumerable: true,
            configurable: true,
            writable: true
          };
        },
        getPrototypeOf: () => {
          trapCalls += 1;
          return Object.prototype;
        }
      }
    );

    expectBudgetCode(
      () =>
        port.assertInput({
          capability: listSitesCapability,
          input: { proxy }
        }),
      "budget_input_not_json"
    );
    expect(trapCalls).toBe(0);
  });
});

describe("atomic in-memory concurrency budgets", () => {
  it("fails fast at the actor limit while leaving other actors isolated", async () => {
    const port = listSitesPort();
    const first = await reserve(port, "actor-a", propertyResource("shared"), "request-a-1");
    const second = await reserve(port, "actor-a", propertyResource("shared"), "request-a-2");
    await expectBudgetRejection(
      reserve(port, "actor-a", propertyResource("shared"), "request-a-3"),
      "budget_concurrency_actor_exceeded"
    );
    const isolated = await reserve(port, "actor-b", propertyResource("shared"), "request-b-1");

    await Promise.all([
      first.release("success"),
      second.release("error"),
      isolated.release("success")
    ]);
  });

  it("keys property saturation by normalized policyKey, not accepted API aliases", async () => {
    const port = listSitesPort();
    const aliases = [
      "https://example.com/",
      "HTTPS://example.com/",
      "https://EXAMPLE.com/",
      "https://example.com:443/",
      "https://example.com./"
    ];
    const leases = await Promise.all(
      Array.from({ length: MAX_PROPERTY_CONCURRENCY }, (_, index) =>
        reserve(
          port,
          `actor-${index}`,
          propertyResource("canonical-property", aliases[index])
        )
      )
    );
    await expectBudgetRejection(
      reserve(
        port,
        "actor-over",
        propertyResource(
          "canonical-property",
          aliases[MAX_PROPERTY_CONCURRENCY]
        )
      ),
      "budget_concurrency_property_exceeded"
    );
    await Promise.all(leases.map((lease) => lease.release("success")));
  });

  it("rejects structurally forged resources at the budget boundary", async () => {
    const forged = {
      kind: "property",
      property: {
        apiValue: "https://example.com/",
        policyKey: "search-console-property:url-prefix:https://example.com/"
      }
    } as unknown as NormalizedCapabilityResource;

    await expectBudgetRejection(
      reserve(listSitesPort(), "actor-forged", forged),
      "budget_request_invalid"
    );
  });

  it("enforces process saturation across isolated actors and properties, then recovers", async () => {
    const port = listSitesPort();
    const fill = () =>
      Promise.all(
        Array.from({ length: MAX_PROCESS_CONCURRENCY }, (_, index) =>
          reserve(port, `actor-${index}`, propertyResource(`property-${index}`), `request-${index}`)
        )
      );
    const leases = await fill();
    await expectBudgetRejection(
      reserve(port, "actor-over", propertyResource("property-over"), "request-over"),
      "budget_concurrency_process_exceeded"
    );
    await Promise.all(leases.map((lease) => lease.release("success")));

    const recovered = await fill();
    await Promise.all(recovered.map((lease) => lease.release("success")));
  });

  it("shares process concurrency across independently constructed budget ports", async () => {
    const leftPort = listSitesPort();
    const rightPort = listSitesPort();
    const leases = await Promise.all(
      Array.from({ length: MAX_PROCESS_CONCURRENCY }, (_, index) =>
        reserve(
          index % 2 === 0 ? leftPort : rightPort,
          `cross-port-actor-${index}`,
          propertyResource(`cross-port-property-${index}`),
          `cross-port-request-${index}`
        )
      )
    );

    await expectBudgetRejection(
      reserve(
        rightPort,
        "cross-port-over",
        propertyResource("cross-port-over"),
        "cross-port-request-over"
      ),
      "budget_concurrency_process_exceeded"
    );
    await Promise.all(leases.map((lease) => lease.release("success")));

    const recovered = await reserve(
      leftPort,
      "cross-port-recovered",
      propertyResource("cross-port-recovered")
    );
    await recovered.release("success");
  });

  it("enforces the lease-scoped Google gateway operation budget", async () => {
    const lease = await reserve(
      listSitesPort(),
      "gateway-actor",
      propertyResource("gateway-property"),
      "gateway-request"
    );

    expect(() => lease.consumeGatewayOperation()).not.toThrow();
    expectBudgetCode(
      () => lease.consumeGatewayOperation(),
      "budget_gateway_operations_exceeded"
    );
    await lease.release("error");
    expectBudgetCode(
      () => lease.consumeGatewayOperation(),
      "budget_request_invalid"
    );
  });

  it("makes release idempotent without counter underflow", async () => {
    const port = listSitesPort();
    const first = await reserve(port, "actor-a", propertyResource("property-a"), "request-1");
    const second = await reserve(port, "actor-a", propertyResource("property-a"), "request-2");
    await first.release("success");
    await first.release("error");

    const replacement = await reserve(
      port,
      "actor-a",
      propertyResource("property-a"),
      "request-3"
    );
    await expectBudgetRejection(
      reserve(port, "actor-a", propertyResource("property-a"), "request-4"),
      "budget_concurrency_actor_exceeded"
    );
    await Promise.all([second.release("success"), replacement.release("success")]);
  });

  it("accepts the exact read deadline and rejects one millisecond over", async () => {
    const port = listSitesPort();
    const exact = await port.reserve({
      context: context(),
      capability: listSitesCapability,
      resource: accountResource(),
      input: {}
    });
    await exact.release("success");
    await expectBudgetRejection(
      port.reserve({
        context: { ...context(), totalDeadlineMs: READ_TOTAL_DEADLINE_MS + 1 },
        capability: listSitesCapability,
        resource: accountResource(),
        input: {}
      }),
      "budget_read_deadline_exceeded"
    );
  });
});
