import {
  assertCapabilityInputWithinBudget,
  assertCapabilityInvocationWithinBudget,
  assertCapabilityOutputWithinBudget,
  BudgetLimitError,
  DEFAULT_CAPABILITY_BUDGETS,
  MAX_ACTOR_CONCURRENCY,
  MAX_PROCESS_CONCURRENCY,
  MAX_PROPERTY_CONCURRENCY,
  READ_TOTAL_DEADLINE_MS,
  validateCapabilityBudget
} from "./budget-limits.js";
import type { CapabilityBudget } from "./budget-limits.js";
import { isSearchConsoleProperty } from "../resources/index.js";
import type {
  BudgetInputAssertionRequest,
  BudgetLease,
  BudgetOutputAssertionRequest,
  BudgetPort,
  BudgetReservationRequest,
  NormalizedCapabilityResource
} from "./ports.js";

export interface InMemoryBudgetPortOptions {
  readonly capabilityBudgets?: Readonly<Record<string, CapabilityBudget>>;
}

interface ProcessBudgetState {
  readonly actorCounts: Map<string, number>;
  readonly propertyCounts: Map<string, number>;
  processCount: number;
  reservationSequence: number;
}

const processBudgetState: ProcessBudgetState = {
  actorCounts: new Map<string, number>(),
  propertyCounts: new Map<string, number>(),
  processCount: 0,
  reservationSequence: 0
};

function validatedBudgetTable(
  input: Readonly<Record<string, CapabilityBudget>>
): ReadonlyMap<string, CapabilityBudget> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BudgetLimitError("budget_invalid_configuration", "Capability budgets must be an object");
  }
  const entries = Object.entries(input);
  if (entries.length === 0) {
    throw new BudgetLimitError(
      "budget_invalid_configuration",
      "At least one capability budget is required"
    );
  }
  const budgets = new Map<string, CapabilityBudget>();
  for (const [capabilityName, rawBudget] of entries) {
    if (!/^[a-z0-9_]{1,128}$/.test(capabilityName)) {
      throw new BudgetLimitError(
        "budget_invalid_configuration",
        "Capability budget keys must be exact tool names"
      );
    }
    budgets.set(capabilityName, validateCapabilityBudget(rawBudget));
  }
  return budgets;
}

function budgetFor(
  budgets: ReadonlyMap<string, CapabilityBudget>,
  capability: BudgetInputAssertionRequest["capability"]
): CapabilityBudget {
  const budget = budgets.get(capability.name);
  if (!budget) {
    throw new BudgetLimitError(
      "budget_unknown_capability",
      "No deterministic budget is configured for the capability"
    );
  }
  if (budget.profileId !== capability.budgetProfile) {
    throw new BudgetLimitError(
      "budget_profile_mismatch",
      "Capability manifest and deterministic budget profile do not match"
    );
  }
  return budget;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BudgetLimitError("budget_request_invalid", `${field} is required for budget reservation`);
  }
  return value;
}

function propertyPolicyKey(
  resource: NormalizedCapabilityResource,
  tenantId: string
): string {
  if (resource.kind === "account") {
    if (Object.keys(resource).length !== 1) {
      throw new BudgetLimitError(
        "budget_request_invalid",
        "Account budget resources must match the exact normalized contract"
      );
    }
    return JSON.stringify(["account", tenantId]);
  }
  if (isSearchConsoleProperty(resource.property)) {
    const policyKey = resource.property.policyKey;
    return policyKey;
  }
  throw new BudgetLimitError(
    "budget_request_invalid",
    "A parser-created normalized property is required for budget reservation"
  );
}

function increment(counts: Map<string, number>, key: string, units: number): void {
  counts.set(key, (counts.get(key) ?? 0) + units);
}

function decrement(counts: Map<string, number>, key: string, units: number): void {
  const current = counts.get(key);
  if (current === undefined || current < units) return;
  const next = current - units;
  if (next === 0) {
    counts.delete(key);
  } else {
    counts.set(key, next);
  }
}

export function createInMemoryBudgetPort(
  options: InMemoryBudgetPortOptions = {}
): BudgetPort {
  const budgets = validatedBudgetTable(options.capabilityBudgets ?? DEFAULT_CAPABILITY_BUDGETS);

  const assertInput = (request: BudgetInputAssertionRequest): void => {
    const budget = budgetFor(budgets, request.capability);
    assertCapabilityInvocationWithinBudget(request.input, budget);
  };

  const port: BudgetPort = {
    assertInput,
    async reserve(request: BudgetReservationRequest): Promise<BudgetLease> {
      const budget = budgetFor(budgets, request.capability);
      assertCapabilityInputWithinBudget(request.capability, request.input, budget);
      const requestId = requireNonEmptyString(request.context.requestId, "requestId");
      const actorId = requireNonEmptyString(request.context.actorId, "actorId");
      const tenantId = requireNonEmptyString(request.context.tenantId, "tenantId");
      if (
        !Number.isInteger(request.context.totalDeadlineMs) ||
        request.context.totalDeadlineMs < 1 ||
        request.context.totalDeadlineMs > READ_TOTAL_DEADLINE_MS
      ) {
        throw new BudgetLimitError(
          "budget_read_deadline_exceeded",
          `Read total deadline must not exceed ${READ_TOTAL_DEADLINE_MS}ms`
        );
      }

      const units = budget.concurrencyUnits;
      const actorKey = JSON.stringify([tenantId, actorId]);
      const propertyKey = propertyPolicyKey(request.resource, tenantId);
      const actorCount = processBudgetState.actorCounts.get(actorKey) ?? 0;
      const propertyCount =
        processBudgetState.propertyCounts.get(propertyKey) ?? 0;

      // All capacity checks happen before any counter changes. JavaScript runs
      // this section synchronously, so reservation is atomic within a process.
      if (
        processBudgetState.processCount + units >
        MAX_PROCESS_CONCURRENCY
      ) {
        throw new BudgetLimitError(
          "budget_concurrency_process_exceeded",
          "Process capability concurrency is saturated"
        );
      }
      if (actorCount + units > MAX_ACTOR_CONCURRENCY) {
        throw new BudgetLimitError(
          "budget_concurrency_actor_exceeded",
          "Actor capability concurrency is saturated"
        );
      }
      if (propertyCount + units > MAX_PROPERTY_CONCURRENCY) {
        throw new BudgetLimitError(
          "budget_concurrency_property_exceeded",
          "Property capability concurrency is saturated"
        );
      }

      processBudgetState.processCount += units;
      increment(processBudgetState.actorCounts, actorKey, units);
      increment(processBudgetState.propertyCounts, propertyKey, units);
      processBudgetState.reservationSequence += 1;
      const reservationId =
        `memory-budget:${requestId}:${processBudgetState.reservationSequence}`;
      let released = false;
      let gatewayOperations = 0;

      await Promise.resolve();
      return Object.freeze({
        status: "reserved" as const,
        reservationId,
        consumeGatewayOperation(): void {
          if (released) {
            throw new BudgetLimitError(
              "budget_request_invalid",
              "A released budget lease cannot consume a gateway operation"
            );
          }
          if (gatewayOperations + 1 > budget.maxGatewayOperations) {
            throw new BudgetLimitError(
              "budget_gateway_operations_exceeded",
              `Capability exceeds ${budget.maxGatewayOperations} Google gateway operations`
            );
          }
          gatewayOperations += 1;
        },
        release(): Promise<void> {
          if (released) return Promise.resolve();
          released = true;
          processBudgetState.processCount = Math.max(
            0,
            processBudgetState.processCount - units
          );
          decrement(processBudgetState.actorCounts, actorKey, units);
          decrement(processBudgetState.propertyCounts, propertyKey, units);
          return Promise.resolve();
        }
      });
    },
    assertRawOutput(request: BudgetOutputAssertionRequest): void {
      const budget = budgetFor(budgets, request.capability);
      assertCapabilityOutputWithinBudget(request.output, budget);
    },
    assertOutput(request: BudgetOutputAssertionRequest): void {
      const budget = budgetFor(budgets, request.capability);
      assertCapabilityOutputWithinBudget(request.output, budget);
    }
  };

  return Object.freeze(port);
}
