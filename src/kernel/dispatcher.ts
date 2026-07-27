import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import {
  isHttpTargetUrl,
  isSearchConsoleProperty,
  parseHttpTargetUrl,
  parseSearchConsoleProperty,
  requireTargetUnderProperty
} from "../resources/index.js";
import { BudgetLimitError } from "./budget-limits.js";
import type { CapabilityDefinition, CapabilityProfileMode, CapabilityRegistry } from "./manifest.js";
import type {
  AuditPort,
  BudgetLease,
  BudgetPort,
  ErrorPort,
  ExecutorPort,
  NormalizedCapabilityResource,
  StaticPolicyDecision,
  StaticPolicyPort,
  TerminalAuditBudgetOutcome,
  TerminalAuditEvent,
  TerminalAuditPolicyDecision
} from "./ports.js";
import { createDeploymentProfile, normalizeRequestContext } from "./profile.js";
import type {
  CallerIdentity,
  DeploymentProfile,
  RequestContext,
  RequestContextFactoryPort
} from "./profile.js";

export interface CapabilityInvocation {
  readonly toolName: string;
  readonly input: unknown;
  readonly identity: CallerIdentity;
  readonly signal?: AbortSignal;
}

export interface CapabilityDispatcher {
  dispatch(invocation: CapabilityInvocation): Promise<CallToolResult>;
}

export interface CapabilityDispatcherDependencies {
  readonly registry: CapabilityRegistry;
  readonly profile: DeploymentProfile;
  readonly contextFactory: RequestContextFactoryPort;
  readonly staticPolicy: StaticPolicyPort;
  readonly budget: BudgetPort;
  readonly executor: ExecutorPort;
  readonly errors: ErrorPort;
  readonly audit: AuditPort;
}

const dispatcherInstances = new WeakSet<object>();
const dispatcherBindings = new WeakMap<
  object,
  Readonly<{ registry: CapabilityRegistry; profileMode: CapabilityProfileMode }>
>();

export function isCapabilityDispatcher(input: unknown): input is CapabilityDispatcher {
  return typeof input === "object" && input !== null && dispatcherInstances.has(input);
}

export function listCapabilitiesForDispatcher(input: unknown): readonly CapabilityDefinition[] {
  if (!isCapabilityDispatcher(input)) {
    throw new Error("Capability discovery requires a capability dispatcher.");
  }
  const binding = dispatcherBindings.get(input);
  if (!binding) {
    throw new Error("Capability dispatcher binding is unavailable.");
  }
  return binding.registry.listForProfile(binding.profileMode);
}

const staticPolicyDecisionSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("allow"),
    policyKey: z.string().min(1),
    authorizedResource: z.custom<NormalizedCapabilityResource>(
      (value) => isNormalizedCapabilityResource(value),
      { error: "Policy allow decision must contain a normalized authorized resource" }
    )
  }),
  z.strictObject({
    outcome: z.literal("deny"),
    policyKey: z.string().min(1),
    reason: z.string().min(1)
  })
]);

const budgetLeaseSchema = z.strictObject({
  status: z.literal("reserved"),
  reservationId: z.string().min(1),
  consumeGatewayOperation: z.custom<BudgetLease["consumeGatewayOperation"]>(
    (value) => typeof value === "function",
    {
      error: "Budget lease must provide a gateway-operation function"
    }
  ),
  release: z.custom<BudgetLease["release"]>((value) => typeof value === "function", {
    error: "Budget lease must provide a release function"
  })
});

export class KernelDispatchError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "KernelDispatchError";
  }
}

/**
 * A reservation that failed lease validation has already mutated the port's
 * counters, so the permits leak unless the port is given a chance to reclaim
 * them. Best effort only: a port that cannot release its own malformed lease
 * has nothing further to offer.
 */
async function releaseUnvalidatedReservation(candidate: unknown): Promise<void> {
  if (!isRecord(candidate)) return;
  const release = candidate.release;
  if (typeof release !== "function") return;
  await Promise.resolve()
    .then(() => (release as BudgetLease["release"]).call(candidate, "error"))
    .catch(() => undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFunction(record: Record<string, unknown>, key: string, portName: string): void {
  if (typeof record[key] !== "function") {
    throw new Error(`Capability dispatcher requires ${portName}.${key}`);
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Capability dispatcher requires ${name}`);
  }
  return value;
}

function validateDependencies(input: unknown): CapabilityDispatcherDependencies {
  const dependencies = requireRecord(input, "dependencies");
  const registry = requireRecord(dependencies.registry, "registry");
  const profile = createDeploymentProfile(requireRecord(dependencies.profile, "profile"));
  const contextFactory = requireRecord(dependencies.contextFactory, "contextFactory");
  const staticPolicy = requireRecord(dependencies.staticPolicy, "staticPolicy");
  const budget = requireRecord(dependencies.budget, "budget");
  const executor = requireRecord(dependencies.executor, "executor");
  const errors = requireRecord(dependencies.errors, "errors");
  const audit = requireRecord(dependencies.audit, "audit");

  requireFunction(registry, "lookupActive", "registry");
  requireFunction(registry, "lookupUnsupported", "registry");
  requireFunction(registry, "listForProfile", "registry");
  if (!Array.isArray(registry.active) || !Array.isArray(registry.unsupported) || typeof registry.version !== "string") {
    throw new Error("Capability dispatcher requires a complete capability registry");
  }
  requireFunction(contextFactory, "create", "contextFactory");
  requireFunction(staticPolicy, "authorizeStatic", "staticPolicy");
  requireFunction(staticPolicy, "filterOutput", "staticPolicy");
  requireFunction(budget, "assertInput", "budget");
  requireFunction(budget, "reserve", "budget");
  requireFunction(budget, "assertRawOutput", "budget");
  requireFunction(budget, "assertOutput", "budget");
  requireFunction(executor, "execute", "executor");
  requireFunction(errors, "toCallToolResult", "errors");
  requireFunction(audit, "recordTerminal", "audit");
  if (audit.durability !== "ephemeral" && audit.durability !== "durable") {
    throw new Error("Capability dispatcher requires audit.durability");
  }

  return Object.freeze({
    registry: registry as unknown as CapabilityRegistry,
    profile,
    contextFactory: contextFactory as unknown as RequestContextFactoryPort,
    staticPolicy: staticPolicy as unknown as StaticPolicyPort,
    budget: budget as unknown as BudgetPort,
    executor: executor as unknown as ExecutorPort,
    errors: errors as unknown as ErrorPort,
    audit: audit as unknown as AuditPort
  });
}

function exactInputString(input: unknown, field: string): string {
  if (!isRecord(input) || typeof input[field] !== "string" || input[field].length === 0) {
    throw new KernelDispatchError("invalid_resource", `Validated capability input is missing ${field}`);
  }
  return input[field];
}

function selectResource(capability: CapabilityDefinition, input: unknown): NormalizedCapabilityResource {
  switch (capability.resourceScope.kind) {
    case "account":
      return Object.freeze({ kind: "account" });
    case "property": {
      const property = parseSearchConsoleProperty(
        exactInputString(input, capability.resourceScope.propertyInputField)
      );
      return Object.freeze({
        kind: "property",
        property
      });
    }
    case "property-target": {
      const property = parseSearchConsoleProperty(
        exactInputString(input, capability.resourceScope.propertyInputField)
      );
      const target = parseHttpTargetUrl(
        exactInputString(input, capability.resourceScope.targetInputField)
      );
      try {
        requireTargetUnderProperty(property, target);
      } catch (error) {
        throw new KernelDispatchError(
          "resource_containment_denied",
          "The requested target is not contained by the requested property",
          { cause: error }
        );
      }
      return Object.freeze({
        kind: "property-target",
        property,
        target
      });
    }
  }
}

function isNormalizedCapabilityResource(value: unknown): value is NormalizedCapabilityResource {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "account") {
    return Object.keys(value).length === 1;
  }
  if (value.kind === "property") {
    return Object.keys(value).length === 2 && isSearchConsoleProperty(value.property);
  }
  return (
    value.kind === "property-target" &&
    Object.keys(value).length === 3 &&
    isSearchConsoleProperty(value.property) &&
    isHttpTargetUrl(value.target)
  );
}

function requireAuthorizedResource(
  requested: NormalizedCapabilityResource,
  authorized: NormalizedCapabilityResource
): NormalizedCapabilityResource {
  if (requested.kind !== authorized.kind) {
    throw new KernelDispatchError(
      "invalid_policy_decision",
      "Policy changed the capability resource kind"
    );
  }
  if (requested.kind === "account" && authorized.kind === "account") {
    return Object.freeze({ kind: "account" });
  }
  if (requested.kind === "property" && authorized.kind === "property") {
    if (requested.property.policyKey !== authorized.property.policyKey) {
      throw new KernelDispatchError(
        "invalid_policy_decision",
        "Policy changed the normalized property identity"
      );
    }
    return Object.freeze({ kind: "property", property: authorized.property });
  }
  if (requested.kind === "property-target" && authorized.kind === "property-target") {
    if (
      requested.property.policyKey !== authorized.property.policyKey ||
      requested.target !== authorized.target
    ) {
      throw new KernelDispatchError(
        "invalid_policy_decision",
        "Policy changed the normalized property target"
      );
    }
    requireTargetUnderProperty(authorized.property, authorized.target);
    return Object.freeze({
      kind: "property-target",
      property: authorized.property,
      target: authorized.target
    });
  }
  throw new KernelDispatchError("invalid_policy_decision", "Policy returned an invalid resource");
}

function createBoundedSignal(context: RequestContext, upstream: AbortSignal | undefined): AbortSignal {
  const startedAtMs = Date.parse(context.startedAt);
  if (!Number.isFinite(startedAtMs)) {
    throw new KernelDispatchError("invalid_context", "Request context has an invalid start time");
  }
  const elapsedMs = Math.max(0, Date.now() - startedAtMs);
  const remainingMs = context.totalDeadlineMs - elapsedMs;
  if (remainingMs <= 0) {
    throw new KernelDispatchError(
      "deadline_exceeded",
      "The capability request deadline expired before execution"
    );
  }
  const deadlineSignal = AbortSignal.timeout(remainingMs);
  return upstream ? AbortSignal.any([upstream, deadlineSignal]) : deadlineSignal;
}

function optionalAbortSignal(input: unknown): AbortSignal | undefined {
  if (input === undefined) return undefined;
  if (!(input instanceof AbortSignal)) {
    throw new KernelDispatchError("invalid_signal", "Capability invocation signal must be an AbortSignal");
  }
  return input;
}

function successResult(output: unknown): CallToolResult {
  if (!isRecord(output)) {
    throw new KernelDispatchError("invalid_output", "Capability output must be a structured object");
  }
  return {
    content: [{ type: "text", text: summarizeStructuredContent(output) }],
    structuredContent: output
  };
}

function countSummary(count: number, singular: string, plural = `${singular}s`): string {
  return `Returned ${count} ${count === 1 ? singular : plural}.`;
}

function summarizeStructuredContent(output: Record<string, unknown>): string {
  if (Array.isArray(output.sites)) {
    return countSummary(output.sites.length, "Search Console site");
  }
  if (Array.isArray(output.rows)) {
    return countSummary(output.rows.length, "search analytics row");
  }
  if (Array.isArray(output.sitemaps)) {
    return countSummary(output.sitemaps.length, "sitemap");
  }
  if ("indexStatus" in output) {
    return "URL inspection completed.";
  }
  return "Returned structured result.";
}

function assertContextMatchesProfile(context: RequestContext, profile: DeploymentProfile): void {
  if (
    context.deploymentProfile !== profile.deploymentProfile ||
    context.accessMode !== profile.accessMode ||
    context.transport !== profile.transport ||
    context.totalDeadlineMs !== profile.totalDeadlineMs
  ) {
    throw new KernelDispatchError(
      "invalid_context",
      "Request context does not match the dispatcher deployment profile"
    );
  }
}

function failureCode(error: unknown): string {
  if (error instanceof KernelDispatchError || error instanceof BudgetLimitError) {
    return error.code;
  }
  return "internal_error";
}

function afterSuccessfulRelease(
  outcome: TerminalAuditBudgetOutcome
): TerminalAuditBudgetOutcome {
  return outcome === "output-rejected" || outcome === "gateway-denied"
    ? outcome
    : "released";
}

function terminalEvent(input: {
  readonly context: RequestContext | undefined;
  readonly capability: CapabilityDefinition | undefined;
  readonly toolName: string;
  readonly policyDecision: TerminalAuditPolicyDecision;
  readonly budgetOutcome: TerminalAuditBudgetOutcome;
  readonly startedAtMs: number;
  readonly failure: unknown;
  readonly hasOutput: boolean;
}): TerminalAuditEvent {
  const context = input.context;
  return Object.freeze({
    timestamp: new Date().toISOString(),
    requestId: context?.requestId ?? "unavailable",
    ...(context
      ? {
          actorId: context.actorId,
          tenantId: context.tenantId,
          deploymentProfile: context.deploymentProfile,
          accessMode: context.accessMode,
          transport: context.transport
        }
      : {}),
    tool: input.toolName,
    ...(input.capability
      ? {
          contractVersion: input.capability.contractVersion,
          googleMethod: input.capability.googleMethod
        }
      : {}),
    policyDecision: input.policyDecision,
    budgetOutcome: input.budgetOutcome,
    durationMs: Math.max(0, Date.now() - input.startedAtMs),
    resultCode: input.failure === undefined ? "ok" : failureCode(input.failure),
    outputClass: input.hasOutput ? "structured" : "none"
  });
}

export function createCapabilityDispatcher(input: CapabilityDispatcherDependencies): CapabilityDispatcher {
  const dependencies = validateDependencies(input);
  const profileMode: CapabilityProfileMode =
    `${dependencies.profile.deploymentProfile}:${dependencies.profile.accessMode}`;

  const dispatcher: CapabilityDispatcher = Object.freeze({
    async dispatch(invocation: CapabilityInvocation): Promise<CallToolResult> {
      const invocationStartedAtMs = Date.now();
      let safeToolName = "<invalid>";
      let context: RequestContext | undefined;
      let capability: CapabilityDefinition | undefined;
      let lease: BudgetLease | undefined;
      let output: unknown;
      let failure: unknown;
      let policyDecision: TerminalAuditPolicyDecision = "not-reached";
      let budgetOutcome: TerminalAuditBudgetOutcome = "not-reached";

      try {
        const invocationRecord: Record<string, unknown> = isRecord(invocation) ? invocation : {};
        const rawToolName = invocationRecord.toolName;
        safeToolName =
          typeof rawToolName === "string" && /^[a-z0-9_]{1,128}$/.test(rawToolName)
            ? rawToolName
            : "<invalid>";
        context = normalizeRequestContext(
          dependencies.contextFactory.create({
            identity: invocationRecord.identity as CallerIdentity,
            toolName: safeToolName
          })
        );
        assertContextMatchesProfile(context, dependencies.profile);

        capability = dependencies.registry.lookupActive(safeToolName);
        if (!capability) {
          const unsupported = dependencies.registry.lookupUnsupported(safeToolName);
          if (unsupported) {
            throw new KernelDispatchError(
              "unsupported_capability",
              `${unsupported.name} is unsupported: ${unsupported.reasonCode}`
            );
          }
          throw new KernelDispatchError("unknown_capability", "Unknown capability.");
        }
        const visibleCapabilities = dependencies.registry.listForProfile(profileMode);
        if (!visibleCapabilities.some((entry) => entry.name === capability?.name)) {
          throw new KernelDispatchError(
            "unsupported_profile",
            `${safeToolName} is unavailable for the active deployment profile and mode`
          );
        }

        try {
          dependencies.budget.assertInput({
            capability,
            input: invocationRecord.input
          });
        } catch (error) {
          budgetOutcome = "input-rejected";
          throw error;
        }
        const normalizedInput = capability.inputSchema.parse(invocationRecord.input);
        const upstreamSignal = optionalAbortSignal(invocationRecord.signal);
        const requestedResource = selectResource(capability, normalizedInput);
        const rawDecision = await dependencies.staticPolicy.authorizeStatic({
          context,
          capability,
          resource: requestedResource,
          input: normalizedInput
        });
        const decision: StaticPolicyDecision = staticPolicyDecisionSchema.parse(rawDecision);
        policyDecision = decision.outcome === "allow" ? "allow" : "deny";
        if (decision.outcome === "deny") {
          throw new KernelDispatchError("policy_denied", decision.reason);
        }
        const resource = requireAuthorizedResource(
          requestedResource,
          decision.authorizedResource
        );

        let reservedLease: unknown;
        try {
          reservedLease = await dependencies.budget.reserve({
            context,
            capability,
            resource,
            input: normalizedInput
          });
          // Validate the shape but keep the port's own object. `parse()` returns a
          // clone, which would invoke the lease methods detached from their receiver.
          budgetLeaseSchema.parse(reservedLease);
          lease = reservedLease as BudgetLease;
          budgetOutcome = "reserved";
        } catch (error) {
          budgetOutcome =
            error instanceof BudgetLimitError &&
            error.code.startsWith("budget_concurrency_")
              ? "concurrency-denied"
              : "reservation-error";
          await releaseUnvalidatedReservation(reservedLease);
          if (error instanceof BudgetLimitError) throw error;
          throw new KernelDispatchError(
            "budget_reservation_failed",
            "Budget reservation failed",
            { cause: error }
          );
        }

        const signal = createBoundedSignal(context, upstreamSignal);
        try {
          lease.consumeGatewayOperation();
        } catch (error) {
          budgetOutcome = "gateway-denied";
          throw error;
        }
        const rawOutput = await dependencies.executor.execute({
          context,
          capability,
          resource,
          input: normalizedInput,
          signal
        });
        try {
          dependencies.budget.assertRawOutput({
            context,
            capability,
            resource,
            output: rawOutput
          });
        } catch (error) {
          budgetOutcome = "output-rejected";
          throw error;
        }
        const validatedOutput = capability.outputSchema.parse(rawOutput);
        const filteredOutput = await dependencies.staticPolicy.filterOutput({
          context,
          capability,
          resource,
          output: validatedOutput
        });
        output = capability.outputSchema.parse(filteredOutput);
        try {
          dependencies.budget.assertOutput({
            context,
            capability,
            resource,
            output
          });
        } catch (error) {
          budgetOutcome = "output-rejected";
          throw error;
        }
      } catch (error) {
        failure = error;
      }

      if (lease) {
        try {
          await lease.release(failure === undefined ? "success" : "error");
          budgetOutcome = afterSuccessfulRelease(budgetOutcome);
        } catch (error) {
          budgetOutcome = "release-error";
          const cause =
            failure === undefined
              ? error
              : new AggregateError([failure, error], "Capability execution and budget release both failed");
          failure = new KernelDispatchError("budget_release_failed", "Budget lease release failed", {
            cause
          });
        }
      }

      const event = terminalEvent({
        context,
        capability,
        toolName: safeToolName,
        policyDecision,
        budgetOutcome,
        startedAtMs: invocationStartedAtMs,
        failure,
        hasOutput: output !== undefined
      });

      try {
        await dependencies.audit.recordTerminal(event);
      } catch (error) {
        const cause =
          failure === undefined
            ? error
            : new AggregateError(
                [failure, error],
                "Capability execution and terminal audit both failed"
              );
        failure = new KernelDispatchError("audit_unavailable", "Terminal audit recording failed", {
          cause
        });
      }

      if (failure !== undefined) {
        return dependencies.errors.toCallToolResult(failure, context);
      }
      return successResult(output);
    }
  });
  dispatcherInstances.add(dispatcher);
  dispatcherBindings.set(
    dispatcher,
    Object.freeze({
      registry: dependencies.registry,
      profileMode
    })
  );
  return dispatcher;
}
