import { homedir } from "node:os";
import { join } from "node:path";
import {
  READ_ATTEMPT_TIMEOUT_MS,
  READ_TOTAL_DEADLINE_MS
} from "./kernel/budget-limits.js";
import { parseSearchConsolePropertyAllowlist } from "./resources/index.js";
import type { AccessMode, AppConfig, AuthMode } from "./types.js";

export interface ConfigFlags {
  authMode?: AuthMode;
  mode?: AccessMode;
  legacyReadonly?: boolean;
  allowedProperties?: readonly string[];
  tokenStorePath?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}

export interface ResolveConfigInput {
  env: NodeJS.ProcessEnv;
  flags: ConfigFlags;
  onWarning?: (message: string) => void;
}

export function parseCliFlags(args: readonly string[]): ConfigFlags {
  const flags: ConfigFlags = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current?.startsWith("--")) continue;
    // Split on the first "=" only. Property paths may legitimately contain "=",
    // and a split that drops the remainder silently widens the allowlist.
    const separator = current.indexOf("=");
    const name = separator === -1 ? current : current.slice(0, separator);
    const inlineValue = separator === -1 ? undefined : current.slice(separator + 1);
    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined) index += 1;
    if (value === undefined) throw new Error(`${name} requires a value`);

    switch (name) {
      case "--auth-mode":
        if (value !== "stored" && value !== "adc") throw new Error("--auth-mode must be stored or adc");
        flags.authMode = value;
        break;
      case "--mode":
        if (value === "full_admin") {
          throw new Error(
            "--mode full_admin is unsupported because Google Search Console has no full-admin OAuth scope or API mode."
          );
        }
        if (value !== "read_only" && value !== "operator") {
          throw new Error("--mode must be read_only or operator");
        }
        flags.mode = value;
        break;
      case "--allowed-property":
        flags.allowedProperties = [...(flags.allowedProperties ?? []), value];
        break;
      case "--readonly":
        if (value !== "true" && value !== "false") throw new Error("--readonly must be true or false");
        flags.legacyReadonly = value === "true";
        break;
      case "--token-store":
        flags.tokenStorePath = value;
        break;
      default:
        throw new Error(`Unknown option ${name}`);
    }
  }
  return flags;
}

const DEFAULT_TOKEN_STORE_PATH = join(homedir(), ".gsc-seo-mcp", "tokens.json");
export const LEGACY_READONLY_WARNING =
  "GSC_SEO_MCP_READONLY=true is deprecated; use GSC_SEO_MCP_MODE=read_only instead.";

function optionalString(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

function parseBoolean(name: string, value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be "true" or "false"`);
}

function parseAuthMode(name: string, value: string | undefined): AuthMode | undefined {
  if (value === undefined) return undefined;
  if (value === "stored" || value === "adc") return value;
  throw new Error(`${name} must be "stored" or "adc"`);
}

function parseAccessMode(name: string, value: string | undefined): AccessMode | undefined {
  if (value === undefined) return undefined;
  if (value === "read_only" || value === "operator") return value;
  if (value === "full_admin") {
    throw new Error(`${name}=full_admin is unsupported because Google Search Console has no full-admin OAuth scope or API mode.`);
  }
  throw new Error(`${name} must be "read_only" or "operator"`);
}

function validateAllowedProperties(name: string, value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${name} must be a JSON array of exact Search Console property strings`);
  }
  if (value.length === 0) {
    throw new Error(`${name} must be a non-empty JSON array of exact Search Console property strings`);
  }

  try {
    return parseSearchConsolePropertyAllowlist(value).map((property) => property.apiValue);
  } catch (error) {
    throw new Error(
      `${name} must contain valid, normalization-unique exact Search Console properties: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
}

function parseAllowedProperties(name: string, value: string | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${name} must be valid JSON containing an array of exact Search Console property strings`);
  }
  return validateAllowedProperties(name, parsed);
}

function resolveContainmentMode(explicitMode: AccessMode | undefined, legacyReadonly: boolean | undefined): AccessMode {
  if (legacyReadonly === false) {
    throw new Error(
      "GSC_SEO_MCP_READONLY=false no longer enables writes. WP-00 containment supports only GSC_SEO_MCP_MODE=read_only."
    );
  }
  if (explicitMode === "operator") {
    throw new Error("GSC_SEO_MCP_MODE=operator is disabled during WP-00 containment.");
  }
  return "read_only";
}

export function resolveConfig({ env, flags, onWarning }: ResolveConfigInput): AppConfig {
  const envAuthMode = parseAuthMode("GSC_SEO_MCP_AUTH_MODE", env.GSC_SEO_MCP_AUTH_MODE);
  const envMode = parseAccessMode("GSC_SEO_MCP_MODE", env.GSC_SEO_MCP_MODE);
  const envReadonly = parseBoolean("GSC_SEO_MCP_READONLY", env.GSC_SEO_MCP_READONLY);
  const envAllowedProperties = parseAllowedProperties(
    "GSC_SEO_MCP_ALLOWED_PROPERTIES",
    optionalString(env.GSC_SEO_MCP_ALLOWED_PROPERTIES)
  );
  const allowedProperties =
    flags.allowedProperties === undefined
      ? (envAllowedProperties ?? [])
      : validateAllowedProperties("allowedProperties", flags.allowedProperties);
  const legacyReadonly = flags.legacyReadonly ?? envReadonly;

  if (legacyReadonly === true) {
    onWarning?.(LEGACY_READONLY_WARNING);
  }

  const config: AppConfig = {
    authMode: flags.authMode ?? envAuthMode ?? "stored",
    mode: resolveContainmentMode(flags.mode ?? envMode, legacyReadonly),
    allowedProperties,
    tokenStorePath:
      flags.tokenStorePath ?? optionalString(env.GSC_SEO_MCP_TOKEN_STORE_PATH) ?? DEFAULT_TOKEN_STORE_PATH,
    requestTimeoutMs: READ_ATTEMPT_TIMEOUT_MS,
    totalDeadlineMs: READ_TOTAL_DEADLINE_MS
  };

  const googleClientId = flags.googleClientId ?? optionalString(env.GOOGLE_CLIENT_ID);
  if (googleClientId) config.googleClientId = googleClientId;
  const googleClientSecret = flags.googleClientSecret ?? optionalString(env.GOOGLE_CLIENT_SECRET);
  if (googleClientSecret) config.googleClientSecret = googleClientSecret;

  return config;
}

export function requireAllowedProperties(config: AppConfig): readonly string[] {
  if (config.allowedProperties.length === 0) {
    throw new Error(
      'GSC_SEO_MCP_ALLOWED_PROPERTIES is required for server startup and must be a JSON array such as ["sc-domain:example.com"].'
    );
  }
  return config.allowedProperties;
}

export function requireGoogleOAuthConfig(config: AppConfig): { clientId: string; clientSecret: string } {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for stored OAuth login and live API calls.");
  }
  return { clientId: config.googleClientId, clientSecret: config.googleClientSecret };
}
