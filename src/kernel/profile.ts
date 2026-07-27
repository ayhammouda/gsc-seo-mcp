import * as z from "zod/v4";
import { parseSearchConsolePropertyAllowlist } from "../resources/index.js";
import { MAX_ALLOWLIST_ENTRIES, READ_TOTAL_DEADLINE_MS } from "./budget-limits.js";

export const deploymentProfileSchema = z.strictObject({
  profileId: z.string().min(1),
  deploymentProfile: z.literal("local-stdio"),
  accessMode: z.literal("read_only"),
  transport: z.literal("stdio"),
  allowedProperties: z.array(z.string().min(1)).min(1).max(MAX_ALLOWLIST_ENTRIES),
  totalDeadlineMs: z.int().min(1).max(READ_TOTAL_DEADLINE_MS)
});

export interface DeploymentProfile {
  readonly profileId: string;
  readonly deploymentProfile: "local-stdio";
  readonly accessMode: "read_only";
  readonly transport: "stdio";
  readonly allowedProperties: readonly string[];
  readonly totalDeadlineMs: number;
}

export interface CallerIdentity {
  readonly actorId: string;
  readonly tenantId: string;
}

export interface RequestContext {
  readonly requestId: string;
  readonly actorId: string;
  readonly tenantId: string;
  readonly deploymentProfile: "local-stdio";
  readonly accessMode: "read_only";
  readonly transport: "stdio";
  readonly startedAt: string;
  readonly totalDeadlineMs: number;
}

export interface RequestContextFactoryInput {
  readonly identity: CallerIdentity;
  readonly toolName: string;
}

export interface RequestContextFactoryPort {
  create(input: RequestContextFactoryInput): RequestContext;
}

export interface RequestContextFactoryOptions {
  readonly profile: DeploymentProfile;
  readonly createRequestId?: () => string;
  readonly now?: () => Date;
}

const callerIdentitySchema = z.strictObject({
  actorId: z.string().min(1),
  tenantId: z.string().min(1)
});

export const requestContextSchema = z.strictObject({
  requestId: z.string().min(1),
  actorId: z.string().min(1),
  tenantId: z.string().min(1),
  deploymentProfile: z.literal("local-stdio"),
  accessMode: z.literal("read_only"),
  transport: z.literal("stdio"),
  startedAt: z.iso.datetime({ offset: true }),
  totalDeadlineMs: z.int().min(1).max(READ_TOTAL_DEADLINE_MS)
});

export function createDeploymentProfile(input: unknown): DeploymentProfile {
  const parsed = deploymentProfileSchema.parse(input);
  const allowedProperties = Object.freeze(
    parseSearchConsolePropertyAllowlist(parsed.allowedProperties).map((property) => property.apiValue)
  );
  return Object.freeze({
    ...parsed,
    allowedProperties
  });
}

export function normalizeRequestContext(input: unknown): RequestContext {
  return Object.freeze(requestContextSchema.parse(input));
}

export function createRequestContextFactory(options: RequestContextFactoryOptions): RequestContextFactoryPort {
  const profile = createDeploymentProfile(options.profile);
  const createRequestId = options.createRequestId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());

  return Object.freeze({
    create(input: RequestContextFactoryInput): RequestContext {
      const identity = callerIdentitySchema.parse(input.identity);
      if (typeof input.toolName !== "string" || input.toolName.length === 0) {
        throw new Error("toolName is required to create a request context");
      }

      return normalizeRequestContext({
        requestId: createRequestId(),
        actorId: identity.actorId,
        tenantId: identity.tenantId,
        deploymentProfile: profile.deploymentProfile,
        accessMode: profile.accessMode,
        transport: profile.transport,
        startedAt: now().toISOString(),
        totalDeadlineMs: profile.totalDeadlineMs
      });
    }
  });
}
