import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { HttpTargetUrl, SearchConsoleProperty } from "../resources/index.js";
import type { CapabilityDefinition } from "./manifest.js";
import type { RequestContext } from "./profile.js";

export type NormalizedCapabilityResource =
  | Readonly<{ kind: "account" }>
  | Readonly<{ kind: "property"; property: SearchConsoleProperty }>
  | Readonly<{
      kind: "property-target";
      property: SearchConsoleProperty;
      target: HttpTargetUrl;
    }>;

export interface StaticPolicyRequest {
  readonly context: RequestContext;
  readonly capability: CapabilityDefinition;
  readonly resource: NormalizedCapabilityResource;
  readonly input: unknown;
}

export type StaticPolicyDecision =
  | Readonly<{
      outcome: "allow";
      policyKey: string;
      authorizedResource: NormalizedCapabilityResource;
    }>
  | Readonly<{ outcome: "deny"; policyKey: string; reason: string }>;

export interface OutputFilterRequest {
  readonly context: RequestContext;
  readonly capability: CapabilityDefinition;
  readonly resource: NormalizedCapabilityResource;
  readonly output: unknown;
}

export interface StaticPolicyPort {
  authorizeStatic(request: StaticPolicyRequest): Promise<StaticPolicyDecision>;
  filterOutput(request: OutputFilterRequest): Promise<unknown>;
}

export interface BudgetReservationRequest {
  readonly context: RequestContext;
  readonly capability: CapabilityDefinition;
  readonly resource: NormalizedCapabilityResource;
  readonly input: unknown;
}

export interface BudgetInputAssertionRequest {
  readonly capability: CapabilityDefinition;
  readonly input: unknown;
}

export interface BudgetOutputAssertionRequest {
  readonly context: RequestContext;
  readonly capability: CapabilityDefinition;
  readonly resource: NormalizedCapabilityResource;
  readonly output: unknown;
}

export type BudgetReleaseOutcome = "success" | "error";

export interface BudgetLease {
  readonly status: "reserved";
  readonly reservationId: string;
  consumeGatewayOperation(): void;
  release(outcome: BudgetReleaseOutcome): Promise<void>;
}

export interface BudgetPort {
  assertInput(request: BudgetInputAssertionRequest): void;
  reserve(request: BudgetReservationRequest): Promise<BudgetLease>;
  assertRawOutput(request: BudgetOutputAssertionRequest): void;
  assertOutput(request: BudgetOutputAssertionRequest): void;
}

export interface ExecutorRequest {
  readonly context: RequestContext;
  readonly capability: CapabilityDefinition;
  readonly resource: NormalizedCapabilityResource;
  readonly input: unknown;
  readonly signal: AbortSignal;
}

export interface ExecutorPort {
  execute(request: ExecutorRequest): Promise<unknown>;
}

export interface ErrorPort {
  toCallToolResult(error: unknown, context: RequestContext | undefined): CallToolResult;
}

export type TerminalAuditPolicyDecision = "allow" | "deny" | "not-reached";
export type TerminalAuditBudgetOutcome =
  | "not-reached"
  | "input-rejected"
  | "reservation-error"
  | "concurrency-denied"
  | "reserved"
  | "gateway-denied"
  | "output-rejected"
  | "released"
  | "release-error";

export interface TerminalAuditEvent {
  readonly timestamp: string;
  readonly requestId: string;
  readonly actorId?: string;
  readonly tenantId?: string;
  readonly deploymentProfile?: RequestContext["deploymentProfile"];
  readonly accessMode?: RequestContext["accessMode"];
  readonly transport?: RequestContext["transport"];
  readonly tool: string;
  readonly contractVersion?: string;
  readonly googleMethod?: string;
  readonly policyDecision: TerminalAuditPolicyDecision;
  readonly budgetOutcome: TerminalAuditBudgetOutcome;
  readonly durationMs: number;
  readonly resultCode: string;
  readonly outputClass: "structured" | "none";
}

export interface AuditPort {
  readonly durability: "ephemeral" | "durable";
  recordTerminal(event: TerminalAuditEvent): Promise<void>;
}
