import { homedir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "./types.js";

export interface ConfigFlags {
  readonly?: boolean;
  host?: string;
  port?: number;
  path?: string;
  tokenStorePath?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}

export interface ResolveConfigInput {
  env: NodeJS.ProcessEnv;
  flags: ConfigFlags;
}

const DEFAULT_TOKEN_STORE_PATH = join(homedir(), ".gsc-seo-mcp", "tokens.json");

function optionalString(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

function parseBoolean(name: string, value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be "true" or "false"`);
}

function parsePort(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return validatePort(name, parsed);
}

function validatePort(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return value;
}

function validatePath(name: string, value: string): string {
  if (!value.startsWith("/")) {
    throw new Error(`${name} must start with "/"`);
  }
  return value;
}

function validateLocalHttpHost(name: string, value: string): string {
  if (value !== "127.0.0.1" && value !== "localhost") {
    throw new Error(`${name} must be a loopback host (127.0.0.1 or localhost) until remote HTTP authentication is implemented.`);
  }
  return value;
}

export function resolveConfig({ env, flags }: ResolveConfigInput): AppConfig {
  const envReadonly = parseBoolean("GSC_SEO_MCP_READONLY", env.GSC_SEO_MCP_READONLY);
  const envPort = parsePort("GSC_SEO_MCP_HTTP_PORT", env.GSC_SEO_MCP_HTTP_PORT);
  const path = flags.path ?? optionalString(env.GSC_SEO_MCP_HTTP_PATH) ?? "/mcp";
  const host = flags.host ?? optionalString(env.GSC_SEO_MCP_HTTP_HOST) ?? "127.0.0.1";
  const port = flags.port !== undefined ? validatePort("GSC_SEO_MCP_HTTP_PORT", flags.port) : (envPort ?? 8787);
  const config: AppConfig = {
    tokenStorePath:
      flags.tokenStorePath ?? optionalString(env.GSC_SEO_MCP_TOKEN_STORE_PATH) ?? DEFAULT_TOKEN_STORE_PATH,
    readonly: flags.readonly ?? envReadonly ?? true,
    http: {
      host: validateLocalHttpHost("GSC_SEO_MCP_HTTP_HOST", host),
      port,
      path: validatePath("GSC_SEO_MCP_HTTP_PATH", path)
    },
    requestTimeoutMs: 30_000
  };

  const googleClientId = flags.googleClientId ?? optionalString(env.GOOGLE_CLIENT_ID);
  if (googleClientId) config.googleClientId = googleClientId;
  const googleClientSecret = flags.googleClientSecret ?? optionalString(env.GOOGLE_CLIENT_SECRET);
  if (googleClientSecret) config.googleClientSecret = googleClientSecret;

  return config;
}

export function requireGoogleOAuthConfig(config: AppConfig): { clientId: string; clientSecret: string } {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for auth login and live API calls.");
  }
  return { clientId: config.googleClientId, clientSecret: config.googleClientSecret };
}
