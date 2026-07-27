import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createCapabilityDispatcher,
  createDeploymentProfile,
  createEphemeralAuditPort,
  createExactPropertyAllowlistPolicy,
  createGscServiceExecutorPort,
  createInMemoryBudgetPort,
  createRedactingCallToolResultErrorPort,
  createRequestContextFactory,
  gscCapabilityRegistry,
  READ_ATTEMPT_TIMEOUT_MS
} from "../kernel/index.js";
import type { CallerIdentity, GscServiceProvider } from "../kernel/index.js";
import { createGscMcpServer } from "../mcp-server.js";

export const LOCAL_STDIO_IDENTITY: CallerIdentity = Object.freeze({
  actorId: "local-parent-process",
  tenantId: "local"
});

export interface ContainedServerBootstrapInput {
  readonly mode: unknown;
  readonly allowedProperties: readonly string[];
  readonly requestTimeoutMs: number;
  readonly totalDeadlineMs: number;
  readonly getService: GscServiceProvider;
}

function requireReadOnlyMode(mode: unknown): asserts mode is "read_only" {
  if (mode !== "read_only") {
    throw new Error("The local stdio containment profile supports only read_only mode.");
  }
}

function requireAttemptTimeout(timeoutMs: unknown): asserts timeoutMs is number {
  if (
    typeof timeoutMs !== "number" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > READ_ATTEMPT_TIMEOUT_MS
  ) {
    throw new Error(
      `Google attempt timeout must be an integer from 1 to ${READ_ATTEMPT_TIMEOUT_MS}ms.`
    );
  }
}

export function createContainedGscMcpServer(input: ContainedServerBootstrapInput): McpServer {
  requireReadOnlyMode(input.mode);
  requireAttemptTimeout(input.requestTimeoutMs);
  const profile = createDeploymentProfile({
    profileId: "local-stdio-read-only",
    deploymentProfile: "local-stdio",
    accessMode: input.mode,
    transport: "stdio",
    allowedProperties: input.allowedProperties,
    totalDeadlineMs: input.totalDeadlineMs
  });
  const audit = createEphemeralAuditPort();
  const dispatcher = createCapabilityDispatcher({
    registry: gscCapabilityRegistry,
    profile,
    contextFactory: createRequestContextFactory({ profile }),
    staticPolicy: createExactPropertyAllowlistPolicy({
      allowedProperties: profile.allowedProperties,
      expectedIdentity: LOCAL_STDIO_IDENTITY
    }),
    budget: createInMemoryBudgetPort(),
    executor: createGscServiceExecutorPort(input.getService),
    errors: createRedactingCallToolResultErrorPort(),
    audit
  });

  return createGscMcpServer({
    dispatcher,
    identity: LOCAL_STDIO_IDENTITY
  });
}
