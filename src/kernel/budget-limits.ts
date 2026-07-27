import { types as nodeUtilTypes } from "node:util";
import type { CapabilityDefinition } from "./manifest.js";
import {
  RESOURCE_IDENTIFIER_MAX_BYTES,
  SEARCH_CONSOLE_PROPERTY_ALLOWLIST_MAX_ENTRIES
} from "../resources/limits.js";

export const MAX_CAPABILITY_INPUT_BYTES = 256 * 1024;
export const MAX_CAPABILITY_OUTPUT_BYTES = 1024 * 1024;
export const MAX_ANALYTICS_ROWS_PER_REQUEST = 1_000;
export const MAX_ANALYTICS_WINDOW_ROWS = 25_000;
export const MAX_FILTER_GROUPS = 4;
export const MAX_FILTERS_PER_GROUP = 8;
export const MAX_PROPERTY_OR_URL_BYTES = RESOURCE_IDENTIFIER_MAX_BYTES;
export const MAX_LANGUAGE_CODE_LENGTH = 35;
export const MAX_ALLOWLIST_ENTRIES =
  SEARCH_CONSOLE_PROPERTY_ALLOWLIST_MAX_ENTRIES;
export const MAX_OUTPUT_DEPTH = 32;
export const MAX_OUTPUT_NODES = 50_000;
export const MAX_GATEWAY_OPERATIONS = 1;
export const CAPABILITY_CONCURRENCY_UNITS = 1;
export const MAX_ACTOR_CONCURRENCY = 2;
export const MAX_PROPERTY_CONCURRENCY = 4;
export const MAX_PROCESS_CONCURRENCY = 8;
export const READ_TOTAL_DEADLINE_MS = 45_000;
export const READ_ATTEMPT_TIMEOUT_MS = 30_000;

export type PrimaryOutput = "sites" | "rows" | "sitemaps" | "singleton";

export interface CapabilityBudget {
  readonly profileId: string;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly primaryOutput: PrimaryOutput;
  readonly maxOutputItems: number;
  readonly maxOutputDepth: number;
  readonly maxOutputNodes: number;
  readonly maxGatewayOperations: number;
  readonly concurrencyUnits: number;
}

export type BudgetLimitCode =
  | "budget_invalid_configuration"
  | "budget_unknown_capability"
  | "budget_profile_mismatch"
  | "budget_input_not_json"
  | "budget_input_bytes_exceeded"
  | "budget_input_depth_exceeded"
  | "budget_input_nodes_exceeded"
  | "budget_input_shape_invalid"
  | "budget_row_limit_exceeded"
  | "budget_analytics_window_exceeded"
  | "budget_filter_groups_exceeded"
  | "budget_filters_per_group_exceeded"
  | "budget_property_or_url_bytes_exceeded"
  | "budget_language_code_exceeded"
  | "budget_output_not_json"
  | "budget_output_bytes_exceeded"
  | "budget_output_shape_invalid"
  | "budget_output_items_exceeded"
  | "budget_output_depth_exceeded"
  | "budget_output_nodes_exceeded"
  | "budget_request_invalid"
  | "budget_read_deadline_exceeded"
  | "budget_gateway_operations_exceeded"
  | "budget_concurrency_process_exceeded"
  | "budget_concurrency_actor_exceeded"
  | "budget_concurrency_property_exceeded";

/**
 * Internal, dependency-neutral budget failure. Public error translation is
 * deliberately owned by the kernel error port.
 */
export class BudgetLimitError extends Error {
  constructor(
    readonly code: BudgetLimitCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "BudgetLimitError";
  }
}

const CAPABILITY_BUDGET_KEYS = Object.freeze([
  "profileId",
  "maxInputBytes",
  "maxOutputBytes",
  "primaryOutput",
  "maxOutputItems",
  "maxOutputDepth",
  "maxOutputNodes",
  "maxGatewayOperations",
  "concurrencyUnits"
] as const);

const PRIMARY_OUTPUTS: ReadonlySet<string> = new Set(["sites", "rows", "sitemaps", "singleton"]);
const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;
const encoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidConfiguration(message: string): never {
  throw new BudgetLimitError("budget_invalid_configuration", message);
}

function requireBoundedInteger(
  input: Record<string, unknown>,
  key: keyof CapabilityBudget,
  maximum: number
): number {
  const value = input[key];
  if (!Number.isInteger(value) || typeof value !== "number" || value < 1 || value > maximum) {
    return invalidConfiguration(`${key} must be an integer from 1 to ${maximum}`);
  }
  return value;
}

export function validateCapabilityBudget(input: unknown): CapabilityBudget {
  if (!isRecord(input)) {
    return invalidConfiguration("Capability budget must be an object");
  }
  const keys = Object.keys(input);
  if (
    keys.length !== CAPABILITY_BUDGET_KEYS.length ||
    keys.some((key) => !CAPABILITY_BUDGET_KEYS.includes(key as (typeof CAPABILITY_BUDGET_KEYS)[number]))
  ) {
    return invalidConfiguration("Capability budget fields must match the exact contract");
  }
  const profileId = input.profileId;
  if (typeof profileId !== "string" || !PROFILE_ID_PATTERN.test(profileId)) {
    return invalidConfiguration("profileId must be a stable lower-case identifier");
  }
  const primaryOutput = input.primaryOutput;
  if (typeof primaryOutput !== "string" || !PRIMARY_OUTPUTS.has(primaryOutput)) {
    return invalidConfiguration("primaryOutput must be sites, rows, sitemaps, or singleton");
  }

  const maxInputBytes = requireBoundedInteger(input, "maxInputBytes", MAX_CAPABILITY_INPUT_BYTES);
  const maxOutputBytes = requireBoundedInteger(input, "maxOutputBytes", MAX_CAPABILITY_OUTPUT_BYTES);
  const maxOutputItems = requireBoundedInteger(
    input,
    "maxOutputItems",
    MAX_ANALYTICS_ROWS_PER_REQUEST
  );
  const maxOutputDepth = requireBoundedInteger(input, "maxOutputDepth", MAX_OUTPUT_DEPTH);
  const maxOutputNodes = requireBoundedInteger(input, "maxOutputNodes", MAX_OUTPUT_NODES);
  const maxGatewayOperations = requireBoundedInteger(
    input,
    "maxGatewayOperations",
    MAX_GATEWAY_OPERATIONS
  );
  const concurrencyUnits = requireBoundedInteger(
    input,
    "concurrencyUnits",
    CAPABILITY_CONCURRENCY_UNITS
  );
  if (primaryOutput === "singleton" && maxOutputItems !== 1) {
    return invalidConfiguration("singleton budgets must allow exactly one output item");
  }

  return Object.freeze({
    profileId,
    maxInputBytes,
    maxOutputBytes,
    primaryOutput: primaryOutput as PrimaryOutput,
    maxOutputItems,
    maxOutputDepth,
    maxOutputNodes,
    maxGatewayOperations,
    concurrencyUnits
  });
}

function defaultBudget(
  profileId: string,
  primaryOutput: PrimaryOutput,
  maxOutputItems: number
): CapabilityBudget {
  return validateCapabilityBudget({
    profileId,
    maxInputBytes: MAX_CAPABILITY_INPUT_BYTES,
    maxOutputBytes: MAX_CAPABILITY_OUTPUT_BYTES,
    primaryOutput,
    maxOutputItems,
    maxOutputDepth: MAX_OUTPUT_DEPTH,
    maxOutputNodes: MAX_OUTPUT_NODES,
    maxGatewayOperations: MAX_GATEWAY_OPERATIONS,
    concurrencyUnits: CAPABILITY_CONCURRENCY_UNITS
  });
}

export const DEFAULT_CAPABILITY_BUDGETS: Readonly<Record<string, CapabilityBudget>> = Object.freeze({
  gsc_list_sites: defaultBudget("gsc-list-sites-contained", "sites", MAX_ALLOWLIST_ENTRIES),
  gsc_search_analytics: defaultBudget(
    "gsc-search-analytics-contained",
    "rows",
    MAX_ANALYTICS_ROWS_PER_REQUEST
  ),
  gsc_list_sitemaps: defaultBudget(
    "gsc-list-sitemaps-contained",
    "sitemaps",
    MAX_ANALYTICS_ROWS_PER_REQUEST
  ),
  gsc_inspect_url: defaultBudget("gsc-url-inspection-contained", "singleton", 1)
});

interface JsonInspectionLimits {
  readonly direction: "input" | "output";
  readonly maxDepth: number;
  readonly maxNodes: number;
}

function nonJsonCode(direction: JsonInspectionLimits["direction"]): BudgetLimitCode {
  return direction === "input" ? "budget_input_not_json" : "budget_output_not_json";
}

function depthCode(direction: JsonInspectionLimits["direction"]): BudgetLimitCode {
  return direction === "input"
    ? "budget_input_depth_exceeded"
    : "budget_output_depth_exceeded";
}

function nodesCode(direction: JsonInspectionLimits["direction"]): BudgetLimitCode {
  return direction === "input"
    ? "budget_input_nodes_exceeded"
    : "budget_output_nodes_exceeded";
}

function inspectJsonValue(value: unknown, limits: JsonInspectionLimits): string {
  let nodes = 0;
  const activeAncestors = new WeakSet<object>();

  const visit = (node: unknown, depth: number): unknown => {
    if (depth > limits.maxDepth) {
      throw new BudgetLimitError(
        depthCode(limits.direction),
        `Structured value exceeds the maximum depth of ${limits.maxDepth}`
      );
    }
    nodes += 1;
    if (nodes > limits.maxNodes) {
      throw new BudgetLimitError(
        nodesCode(limits.direction),
        `Structured value exceeds the maximum node count of ${limits.maxNodes}`
      );
    }

    if (node === null || typeof node === "string" || typeof node === "boolean") {
      return node;
    }
    if (typeof node === "number") {
      if (!Number.isFinite(node)) {
        throw new BudgetLimitError(nonJsonCode(limits.direction), "Structured value contains a non-finite number");
      }
      return node;
    }
    if (typeof node !== "object") {
      throw new BudgetLimitError(nonJsonCode(limits.direction), "Structured value is not strict JSON");
    }
    if (nodeUtilTypes.isProxy(node)) {
      throw new BudgetLimitError(
        nonJsonCode(limits.direction),
        "Structured value cannot contain proxy objects"
      );
    }
    if (activeAncestors.has(node)) {
      throw new BudgetLimitError(nonJsonCode(limits.direction), "Structured value contains a cycle");
    }

    activeAncestors.add(node);
    try {
      if (Array.isArray(node)) {
        const ownKeys = Reflect.ownKeys(node);
        if (ownKeys.some((key) => typeof key === "symbol")) {
          throw new BudgetLimitError(
            nonJsonCode(limits.direction),
            "Structured arrays cannot contain symbol keys"
          );
        }
        const lengthDescriptor = Object.getOwnPropertyDescriptor(node, "length");
        const length: unknown = lengthDescriptor?.value as unknown;
        if (
          !lengthDescriptor ||
          !("value" in lengthDescriptor) ||
          !Number.isSafeInteger(length) ||
          typeof length !== "number" ||
          length < 0 ||
          ownKeys.length !== length + 1
        ) {
          throw new BudgetLimitError(
            nonJsonCode(limits.direction),
            "Structured arrays must be dense and contain no named properties"
          );
        }
        const projection: unknown[] = [];
        for (let index = 0; index < length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(
            node,
            String(index)
          );
          if (
            !descriptor ||
            !descriptor.enumerable ||
            !("value" in descriptor)
          ) {
            throw new BudgetLimitError(
              nonJsonCode(limits.direction),
              "Structured arrays must contain enumerable data elements"
            );
          }
          projection.push(visit(descriptor.value, depth + 1));
        }
        return projection;
      }

      const prototype = Object.getPrototypeOf(node) as unknown;
      if (prototype !== Object.prototype && prototype !== null) {
        throw new BudgetLimitError(
          nonJsonCode(limits.direction),
          "Structured objects must use a plain JSON object prototype"
        );
      }
      const ownKeys = Reflect.ownKeys(node);
      if (ownKeys.some((key) => typeof key === "symbol")) {
        throw new BudgetLimitError(
          nonJsonCode(limits.direction),
          "Structured objects cannot contain symbol keys"
        );
      }
      const projection = Object.create(null) as Record<string, unknown>;
      for (const key of ownKeys as string[]) {
        const descriptor = Object.getOwnPropertyDescriptor(node, key);
        if (
          !descriptor ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) {
          throw new BudgetLimitError(
            nonJsonCode(limits.direction),
            "Structured objects must contain only enumerable data properties"
          );
        }
        Object.defineProperty(projection, key, {
          value: visit(descriptor.value, depth + 1),
          enumerable: true,
          configurable: true,
          writable: true
        });
      }
      return projection;
    } finally {
      activeAncestors.delete(node);
    }
  };

  let projection: unknown;
  try {
    projection = visit(value, 0);
  } catch (error) {
    if (error instanceof BudgetLimitError) throw error;
    throw new BudgetLimitError(
      nonJsonCode(limits.direction),
      "Structured value could not be inspected safely",
      { cause: error }
    );
  }
  const serialized = JSON.stringify(projection);
  if (serialized === undefined) {
    throw new BudgetLimitError(nonJsonCode(limits.direction), "Structured value is not JSON serializable");
  }
  return serialized;
}

function strictJsonByteLength(
  value: unknown,
  direction: JsonInspectionLimits["direction"],
  maxDepth = MAX_OUTPUT_DEPTH,
  maxNodes = MAX_OUTPUT_NODES
): number {
  const serialized = inspectJsonValue(value, { direction, maxDepth, maxNodes });
  return encoder.encode(serialized).byteLength;
}

function assertOptionalString(
  input: Record<string, unknown>,
  key: string,
  code: BudgetLimitCode,
  validate: (value: string) => boolean,
  message: string
): void {
  if (!(key in input)) return;
  const value = input[key];
  if (typeof value !== "string") {
    throw new BudgetLimitError("budget_input_shape_invalid", `${key} must be a string`);
  }
  if (!validate(value)) {
    throw new BudgetLimitError(code, message);
  }
}

function assertKnownInputLimits(capability: CapabilityDefinition, input: unknown): void {
  if (!isRecord(input)) {
    throw new BudgetLimitError("budget_input_shape_invalid", "Normalized capability input must be an object");
  }

  for (const key of ["site_url", "inspection_url", "sitemap_url"]) {
    assertOptionalString(
      input,
      key,
      "budget_property_or_url_bytes_exceeded",
      (value) => encoder.encode(value).byteLength <= MAX_PROPERTY_OR_URL_BYTES,
      `${key} exceeds the ${MAX_PROPERTY_OR_URL_BYTES}-byte limit`
    );
  }
  assertOptionalString(
    input,
    "language_code",
    "budget_language_code_exceeded",
    (value) => [...value].length <= MAX_LANGUAGE_CODE_LENGTH,
    `language_code exceeds the ${MAX_LANGUAGE_CODE_LENGTH}-character limit`
  );

  if (capability.name !== "gsc_search_analytics") return;
  const rowLimit = input.row_limit;
  const startRow = input.start_row;
  const filters = input.filters;
  if (!Number.isInteger(rowLimit) || typeof rowLimit !== "number" || rowLimit < 1) {
    throw new BudgetLimitError("budget_input_shape_invalid", "row_limit must be a positive integer");
  }
  if (rowLimit > MAX_ANALYTICS_ROWS_PER_REQUEST) {
    throw new BudgetLimitError(
      "budget_row_limit_exceeded",
      `row_limit exceeds ${MAX_ANALYTICS_ROWS_PER_REQUEST}`
    );
  }
  if (!Number.isInteger(startRow) || typeof startRow !== "number" || startRow < 0) {
    throw new BudgetLimitError("budget_input_shape_invalid", "start_row must be a non-negative integer");
  }
  if (startRow + rowLimit > MAX_ANALYTICS_WINDOW_ROWS) {
    throw new BudgetLimitError(
      "budget_analytics_window_exceeded",
      `Search Analytics window exceeds ${MAX_ANALYTICS_WINDOW_ROWS} rows`
    );
  }
  if (!Array.isArray(filters)) {
    throw new BudgetLimitError("budget_input_shape_invalid", "filters must be an array");
  }
  if (filters.length > MAX_FILTER_GROUPS) {
    throw new BudgetLimitError(
      "budget_filter_groups_exceeded",
      `filters exceeds ${MAX_FILTER_GROUPS} groups`
    );
  }
  for (const group of filters) {
    if (!isRecord(group) || !Array.isArray(group.filters)) {
      throw new BudgetLimitError("budget_input_shape_invalid", "Each filter group must contain a filters array");
    }
    if (group.filters.length > MAX_FILTERS_PER_GROUP) {
      throw new BudgetLimitError(
        "budget_filters_per_group_exceeded",
        `A filter group exceeds ${MAX_FILTERS_PER_GROUP} filters`
      );
    }
  }
}

export function assertCapabilityInputWithinBudget(
  capability: CapabilityDefinition,
  input: unknown,
  budget: CapabilityBudget
): void {
  assertCapabilityInvocationWithinBudget(input, budget);
  assertKnownInputLimits(capability, input);
}

export function assertCapabilityInvocationWithinBudget(
  input: unknown,
  budget: CapabilityBudget
): void {
  const byteLength = strictJsonByteLength(input, "input");
  if (byteLength > budget.maxInputBytes) {
    throw new BudgetLimitError(
      "budget_input_bytes_exceeded",
      `Capability input exceeds ${budget.maxInputBytes} UTF-8 JSON bytes`
    );
  }
}

function primaryOutputItemCount(output: unknown, primaryOutput: PrimaryOutput): number {
  if (!isRecord(output)) {
    throw new BudgetLimitError("budget_output_shape_invalid", "Capability output must be an object");
  }
  if (primaryOutput === "singleton") return 1;
  const items = output[primaryOutput];
  if (!Array.isArray(items)) {
    throw new BudgetLimitError(
      "budget_output_shape_invalid",
      `Capability output must contain a ${primaryOutput} array`
    );
  }
  return items.length;
}

export function assertCapabilityOutputWithinBudget(
  output: unknown,
  budget: CapabilityBudget
): void {
  const byteLength = strictJsonByteLength(
    output,
    "output",
    budget.maxOutputDepth,
    budget.maxOutputNodes
  );
  if (byteLength > budget.maxOutputBytes) {
    throw new BudgetLimitError(
      "budget_output_bytes_exceeded",
      `Capability output exceeds ${budget.maxOutputBytes} UTF-8 JSON bytes`
    );
  }
  const itemCount = primaryOutputItemCount(output, budget.primaryOutput);
  if (itemCount > budget.maxOutputItems) {
    throw new BudgetLimitError(
      "budget_output_items_exceeded",
      `Capability output exceeds ${budget.maxOutputItems} primary items`
    );
  }
}
