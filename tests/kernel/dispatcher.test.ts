import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import {
  BudgetLimitError,
  createCapabilityDispatcher,
  createDeploymentProfile,
  createEphemeralAuditPort,
  createPassThroughBudgetPort,
  createRedactingCallToolResultErrorPort,
  createRequestContextFactory,
  gscCapabilityRegistry
} from "../../src/kernel/index.js";
import type {
  AuditPort,
  BudgetPort,
  CapabilityDispatcherDependencies,
  ErrorPort,
  ExecutorPort,
  StaticPolicyPort
} from "../../src/kernel/index.js";

const profile = createDeploymentProfile({
  profileId: "test",
  deploymentProfile: "local-stdio",
  accessMode: "read_only",
  transport: "stdio",
  allowedProperties: ["https://example.com/"],
  totalDeadlineMs: 100
});

const contextFactory = createRequestContextFactory({
  profile,
  createRequestId: () => "request-1"
});

const identity = { actorId: "local-parent", tenantId: "local" };

function allowPolicy(overrides: Partial<StaticPolicyPort> = {}): StaticPolicyPort {
  return {
    authorizeStatic: (request) =>
      Promise.resolve({
        outcome: "allow",
        policyKey: "test-policy",
        authorizedResource: request.resource
      }),
    filterOutput: ({ output }) => Promise.resolve(output),
    ...overrides
  };
}

function budgetPort(overrides: Partial<BudgetPort> = {}): BudgetPort {
  return {
    ...createPassThroughBudgetPort(),
    ...overrides
  };
}

function executorFor(output: unknown): ExecutorPort {
  return { execute: () => Promise.resolve(output) };
}

function validDependencies(overrides: Partial<CapabilityDispatcherDependencies> = {}): CapabilityDispatcherDependencies {
  return {
    registry: gscCapabilityRegistry,
    profile,
    contextFactory,
    staticPolicy: allowPolicy(),
    budget: createPassThroughBudgetPort(),
    executor: executorFor({ sites: [] }),
    errors: createRedactingCallToolResultErrorPort(),
    audit: createEphemeralAuditPort(),
    ...overrides
  };
}

describe("capability dispatcher construction", () => {
  it.each([
    "registry",
    "profile",
    "contextFactory",
    "staticPolicy",
    "budget",
    "executor",
    "errors",
    "audit"
  ] as const)("fails closed when mandatory %s is missing", (key) => {
    const dependencies: Record<string, unknown> = { ...validDependencies() };
    Reflect.deleteProperty(dependencies, key);

    expect(() => createCapabilityDispatcher(dependencies as never)).toThrow(/requires/i);
  });

  it.each([
    ["contextFactory", "create"],
    ["staticPolicy", "authorizeStatic"],
    ["staticPolicy", "filterOutput"],
    ["budget", "assertInput"],
    ["budget", "reserve"],
    ["budget", "assertRawOutput"],
    ["budget", "assertOutput"],
    ["executor", "execute"],
    ["errors", "toCallToolResult"],
    ["audit", "recordTerminal"]
  ] as const)("fails closed when %s.%s is missing", (portName, method) => {
    const dependencies: Record<string, unknown> = { ...validDependencies() };
    const port = { ...(dependencies[portName] as Record<string, unknown>) };
    Reflect.deleteProperty(port, method);
    dependencies[portName] = port;

    expect(() => createCapabilityDispatcher(dependencies as never)).toThrow(new RegExp(`${portName}\\.${method}`));
  });
});

describe("capability dispatcher sequencing", () => {
  it("checks raw input, runs policy before reservation and execution, then filters and checks output", async () => {
    const order: string[] = [];
    const staticPolicy = allowPolicy({
      authorizeStatic: (request) => {
        order.push("policy");
        return Promise.resolve({
          outcome: "allow",
          policyKey: "test-policy",
          authorizedResource: request.resource
        });
      },
      filterOutput: ({ output }) => {
        order.push("filter");
        return Promise.resolve(output);
      }
    });
    const budget = budgetPort({
      assertInput: () => {
        order.push("input-budget");
      },
      reserve: () => {
        order.push("reserve");
        return Promise.resolve({
          status: "reserved",
          reservationId: "lease-1",
          consumeGatewayOperation: () => {
            order.push("gateway-operation");
          },
          release: (outcome) => {
            order.push(`release:${outcome}`);
            return Promise.resolve();
          }
        });
      },
      assertRawOutput: () => {
        order.push("raw-output-budget");
      },
      assertOutput: () => {
        order.push("output-budget");
      }
    });
    const executor: ExecutorPort = {
      execute: () => {
        order.push("executor");
        return Promise.resolve({ sites: [] });
      }
    };
    const audit: AuditPort = {
      durability: "ephemeral",
      recordTerminal: () => {
        order.push("audit");
        return Promise.resolve();
      }
    };
    const dispatcher = createCapabilityDispatcher(
      validDependencies({ staticPolicy, budget, executor, audit })
    );

    const result = await dispatcher.dispatch({
      toolName: "gsc_list_sites",
      input: {},
      identity
    });

    expect(result.isError).not.toBe(true);
    expect(order).toEqual([
      "input-budget",
      "policy",
      "reserve",
      "gateway-operation",
      "executor",
      "raw-output-budget",
      "filter",
      "output-budget",
      "release:success",
      "audit"
    ]);
  });

  it("checks raw input, then rejects invalid schema input before policy, reservation, or execution", async () => {
    const authorize = vi.fn<StaticPolicyPort["authorizeStatic"]>((request) =>
      Promise.resolve({
        outcome: "allow",
        policyKey: "test",
        authorizedResource: request.resource
      })
    );
    const staticPolicy = allowPolicy({
      authorizeStatic: authorize
    });
    const passThroughBudget = createPassThroughBudgetPort();
    const assertInput = vi.fn<BudgetPort["assertInput"]>((request) =>
      passThroughBudget.assertInput(request)
    );
    const reserve = vi.fn<BudgetPort["reserve"]>((request) => passThroughBudget.reserve(request));
    const assertOutput = vi.fn<BudgetPort["assertOutput"]>((request) =>
      passThroughBudget.assertOutput(request)
    );
    const budget = budgetPort({ assertInput, reserve, assertOutput });
    const execute = vi.fn(() => Promise.resolve({ sitemaps: [] }));
    const executor: ExecutorPort = { execute };
    const audit = createEphemeralAuditPort();
    const dispatcher = createCapabilityDispatcher(
      validDependencies({ staticPolicy, budget, executor, audit })
    );

    const result = await dispatcher.dispatch({
      toolName: "gsc_list_sitemaps",
      input: {},
      identity
    });

    expect(result.isError).toBe(true);
    expect(assertInput).toHaveBeenCalledOnce();
    expect(authorize).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(assertOutput).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(audit.snapshot()).toHaveLength(1);
    expect(audit.snapshot()[0]?.resultCode).toBe("internal_error");
  });

  it("fails closed on malformed policy decisions before budget or executor", async () => {
    const staticPolicy = allowPolicy({
      authorizeStatic: () => Promise.resolve({ allowed: true } as never)
    });
    const passThroughBudget = createPassThroughBudgetPort();
    const reserve = vi.fn<BudgetPort["reserve"]>((request) => passThroughBudget.reserve(request));
    const budget = budgetPort({ reserve });
    const execute = vi.fn(() => Promise.resolve({ sites: [] }));
    const executor: ExecutorPort = { execute };
    const dispatcher = createCapabilityDispatcher(validDependencies({ staticPolicy, budget, executor }));

    const result = await dispatcher.dispatch({ toolName: "gsc_list_sites", input: {}, identity });

    expect(result.isError).toBe(true);
    expect(reserve).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails closed on malformed budget leases before executor", async () => {
    const audit = createEphemeralAuditPort();
    const budget = budgetPort({
      reserve: () => Promise.resolve({ status: "granted" } as never)
    });
    const execute = vi.fn(() => Promise.resolve({ sites: [] }));
    const executor: ExecutorPort = { execute };
    const dispatcher = createCapabilityDispatcher(validDependencies({ budget, executor, audit }));

    const result = await dispatcher.dispatch({ toolName: "gsc_list_sites", input: {}, identity });

    expect(result.isError).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(audit.snapshot()[0]).toMatchObject({
      budgetOutcome: "reservation-error",
      resultCode: "budget_reservation_failed"
    });
  });

  it("runtime-validates context factory output before policy or execution", async () => {
    const authorize = vi.fn<StaticPolicyPort["authorizeStatic"]>((request) =>
      Promise.resolve({
        outcome: "allow",
        policyKey: "test",
        authorizedResource: request.resource
      })
    );
    const execute = vi.fn(() => Promise.resolve({ sites: [] }));
    const dispatcher = createCapabilityDispatcher(
      validDependencies({
        contextFactory: {
          create: () =>
            ({
              requestId: "request-1",
              actorId: "local-parent",
              tenantId: "local",
              deploymentProfile: "remote-oidc",
              accessMode: "operator",
              transport: "http",
              startedAt: new Date().toISOString(),
              totalDeadlineMs: 100
            }) as never
        },
        staticPolicy: allowPolicy({ authorizeStatic: authorize }),
        executor: { execute }
      })
    );

    const result = await dispatcher.dispatch({ toolName: "gsc_list_sites", input: {}, identity });

    expect(result.isError).toBe(true);
    expect(authorize).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("normalizes a valid mutable context into a frozen dispatcher context", async () => {
    let receivedContextFrozen = false;
    const dispatcher = createCapabilityDispatcher(
      validDependencies({
        contextFactory: {
          create: () => ({
            requestId: "mutable-request",
            actorId: "local-parent",
            tenantId: "local",
            deploymentProfile: "local-stdio",
            accessMode: "read_only",
            transport: "stdio",
            startedAt: new Date().toISOString(),
            totalDeadlineMs: 100
          })
        },
        executor: {
          execute: (request) => {
            receivedContextFrozen = Object.isFrozen(request.context);
            return Promise.resolve({ sites: [] });
          }
        }
      })
    );

    const result = await dispatcher.dispatch({ toolName: "gsc_list_sites", input: {}, identity });

    expect(result.isError).not.toBe(true);
    expect(receivedContextFrozen).toBe(true);
  });

  it("rejects a valid context that does not match the dispatcher-bound profile", async () => {
    const authorize = vi.fn<StaticPolicyPort["authorizeStatic"]>((request) =>
      Promise.resolve({
        outcome: "allow",
        policyKey: "test",
        authorizedResource: request.resource
      })
    );
    const execute = vi.fn(() => Promise.resolve({ sites: [] }));
    const dispatcher = createCapabilityDispatcher(
      validDependencies({
        contextFactory: {
          create: () => ({
            requestId: "mismatched-request",
            actorId: "local-parent",
            tenantId: "local",
            deploymentProfile: "local-stdio",
            accessMode: "read_only",
            transport: "stdio",
            startedAt: new Date().toISOString(),
            totalDeadlineMs: profile.totalDeadlineMs - 1
          })
        },
        staticPolicy: allowPolicy({ authorizeStatic: authorize }),
        executor: { execute }
      })
    );

    const result = await dispatcher.dispatch({ toolName: "gsc_list_sites", input: {}, identity });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "Request context does not match the dispatcher deployment profile"
    });
    expect(authorize).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("validates filtered output and releases the budget as an error", async () => {
    const releases: string[] = [];
    const assertOutput = vi.fn<BudgetPort["assertOutput"]>();
    const budget = budgetPort({
      reserve: () =>
        Promise.resolve({
          status: "reserved",
          reservationId: "lease",
          consumeGatewayOperation: () => {},
          release: (outcome) => {
            releases.push(outcome);
            return Promise.resolve();
          }
        }),
      assertOutput
    });
    const staticPolicy = allowPolicy({
      filterOutput: () => Promise.resolve({ sites: "not-an-array" })
    });
    const dispatcher = createCapabilityDispatcher(
      validDependencies({ budget, staticPolicy, executor: executorFor({ sites: [] }) })
    );

    const result = await dispatcher.dispatch({ toolName: "gsc_list_sites", input: {}, identity });

    expect(result.isError).toBe(true);
    expect(assertOutput).not.toHaveBeenCalled();
    expect(releases).toEqual(["error"]);
  });

  it("rejects raw executor output before schema parsing or policy filtering", async () => {
    const filterOutput = vi.fn<StaticPolicyPort["filterOutput"]>(
      ({ output }) => Promise.resolve(output)
    );
    const audit = createEphemeralAuditPort();
    const budget = budgetPort({
      assertRawOutput: () => {
        throw new BudgetLimitError(
          "budget_output_bytes_exceeded",
          "raw output is too large"
        );
      }
    });
    const dispatcher = createCapabilityDispatcher(
      validDependencies({
        budget,
        staticPolicy: allowPolicy({ filterOutput }),
        executor: executorFor({ sites: [] }),
        audit
      })
    );

    const result = await dispatcher.dispatch({
      toolName: "gsc_list_sites",
      input: {},
      identity
    });

    expect(result.isError).toBe(true);
    expect(filterOutput).not.toHaveBeenCalled();
    expect(audit.snapshot()[0]).toMatchObject({
      budgetOutcome: "output-rejected",
      resultCode: "budget_output_bytes_exceeded"
    });
  });

  it("passes a deadline-bounded signal rather than the raw caller signal", async () => {
    let receivedSignal: AbortSignal | undefined;
    const callerController = new AbortController();
    const shortProfile = createDeploymentProfile({
      ...profile,
      profileId: "deadline-test",
      totalDeadlineMs: 1_000
    });
    const dispatcher = createCapabilityDispatcher(
      validDependencies({
        profile: shortProfile,
        contextFactory: createRequestContextFactory({
          profile: shortProfile,
          createRequestId: () => "deadline-request"
        }),
        executor: {
          execute: (request) => {
            receivedSignal = request.signal;
            return Promise.resolve({ sites: [] });
          }
        }
      })
    );

    const result = await dispatcher.dispatch({
      toolName: "gsc_list_sites",
      input: {},
      identity,
      signal: callerController.signal
    });

    expect(result.isError).not.toBe(true);
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).not.toBe(callerController.signal);
    expect(receivedSignal?.aborted).toBe(false);
  });

  it("rejects a request whose total deadline expired before execution", async () => {
    const execute = vi.fn(() => Promise.resolve({ sites: [] }));
    const audit = createEphemeralAuditPort();
    const dispatcher = createCapabilityDispatcher(
      validDependencies({
        contextFactory: {
          create: () => ({
            requestId: "expired-request",
            actorId: identity.actorId,
            tenantId: identity.tenantId,
            deploymentProfile: profile.deploymentProfile,
            accessMode: profile.accessMode,
            transport: profile.transport,
            startedAt: "2000-01-01T00:00:00.000Z",
            totalDeadlineMs: profile.totalDeadlineMs
          })
        },
        executor: { execute },
        audit
      })
    );

    const result = await dispatcher.dispatch({
      toolName: "gsc_list_sites",
      input: {},
      identity
    });

    expect(result.isError).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(audit.snapshot()[0]).toMatchObject({
      resultCode: "deadline_exceeded",
      budgetOutcome: "released"
    });
  });
});

describe("terminal audit behavior", () => {
  it("fails malformed JavaScript invocations closed and still audits once", async () => {
    const audit = createEphemeralAuditPort();
    const authorize = vi.fn<StaticPolicyPort["authorizeStatic"]>((request) =>
      Promise.resolve({
        outcome: "allow",
        policyKey: "unexpected",
        authorizedResource: request.resource
      })
    );
    const execute = vi.fn<ExecutorPort["execute"]>(() => Promise.resolve({ sites: [] }));
    const dispatcher = createCapabilityDispatcher(
      validDependencies({
        audit,
        staticPolicy: allowPolicy({ authorizeStatic: authorize }),
        executor: { execute }
      })
    );

    const result = await dispatcher.dispatch(undefined as never);

    expect(result.isError).toBe(true);
    expect(authorize).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(audit.snapshot()).toHaveLength(1);
    expect(audit.snapshot()[0]).toMatchObject({
      tool: "<invalid>",
      policyDecision: "not-reached",
      budgetOutcome: "not-reached"
    });
  });

  it("guards invocation property access so hostile getters are projected and audited", async () => {
    const audit = createEphemeralAuditPort();
    const authorize = vi.fn<StaticPolicyPort["authorizeStatic"]>((request) =>
      Promise.resolve({
        outcome: "allow",
        policyKey: "unexpected",
        authorizedResource: request.resource
      })
    );
    const execute = vi.fn<ExecutorPort["execute"]>(() => Promise.resolve({ sites: [] }));
    const dispatcher = createCapabilityDispatcher(
      validDependencies({
        audit,
        staticPolicy: allowPolicy({ authorizeStatic: authorize }),
        executor: { execute }
      })
    );
    const invocation = Object.defineProperty({}, "toolName", {
      get() {
        throw new Error("hostile toolName getter");
      }
    });

    const result = await dispatcher.dispatch(invocation as never);

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text", text: "hostile toolName getter" });
    expect(authorize).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(audit.snapshot()).toHaveLength(1);
    expect(audit.snapshot()[0]).toMatchObject({
      tool: "<invalid>",
      policyDecision: "not-reached",
      budgetOutcome: "not-reached",
      resultCode: "internal_error"
    });
  });

  it.each([
    ["successful execution", executorFor({ sites: [] })],
    ["failed execution", { execute: () => Promise.reject(new Error("executor failed")) } satisfies ExecutorPort]
  ])("surfaces and audits budget release failure after %s", async (_label, executor) => {
    const audit = createEphemeralAuditPort();
    const budget = budgetPort({
      reserve: () =>
        Promise.resolve({
          status: "reserved",
          reservationId: "lease",
          consumeGatewayOperation: () => {},
          release: () => Promise.reject(new Error("release failed"))
        })
    });
    const dispatcher = createCapabilityDispatcher(validDependencies({ audit, budget, executor }));

    const result = await dispatcher.dispatch({ toolName: "gsc_list_sites", input: {}, identity });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text", text: "Budget lease release failed" });
    expect(audit.snapshot()).toHaveLength(1);
    expect(audit.snapshot()[0]).toMatchObject({
      policyDecision: "allow",
      budgetOutcome: "release-error",
      resultCode: "budget_release_failed"
    });
  });

  it("attempts exactly one terminal audit for success and failure", async () => {
    const audit = createEphemeralAuditPort();
    const dispatcher = createCapabilityDispatcher(validDependencies({ audit }));

    await dispatcher.dispatch({ toolName: "gsc_list_sites", input: {}, identity });
    await dispatcher.dispatch({ toolName: "unknown", input: {}, identity });

    expect(audit.snapshot()).toHaveLength(2);
    expect(audit.snapshot().map((event) => event.resultCode)).toEqual(["ok", "unknown_capability"]);
    expect(audit.snapshot().map((event) => event.tool)).toEqual(["gsc_list_sites", "unknown"]);
    expect(audit.snapshot().map((event) => event.budgetOutcome)).toEqual(["released", "not-reached"]);
  });

  it("fails the call after exactly one audit attempt when the audit sink fails", async () => {
    const attempts = vi.fn(() => Promise.reject(new Error("sink unavailable")));
    const audit: AuditPort = { durability: "ephemeral", recordTerminal: attempts };
    const dispatcher = createCapabilityDispatcher(validDependencies({ audit }));

    const result = await dispatcher.dispatch({ toolName: "gsc_list_sites", input: {}, identity });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text", text: "Terminal audit recording failed" });
    expect(attempts).toHaveBeenCalledTimes(1);
  });

  it("redacts error results without a second audit event", async () => {
    const audit = createEphemeralAuditPort();
    const errors: ErrorPort = createRedactingCallToolResultErrorPort();
    const executor: ExecutorPort = {
      execute: () => Promise.reject(new Error("access_token=ya29.secret"))
    };
    const dispatcher = createCapabilityDispatcher(validDependencies({ audit, errors, executor }));

    const result: CallToolResult = await dispatcher.dispatch({
      toolName: "gsc_list_sites",
      input: {},
      identity
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("ya29.secret");
    expect(JSON.stringify(result)).toContain("[REDACTED]");
    expect(audit.snapshot()).toHaveLength(1);
  });
});
