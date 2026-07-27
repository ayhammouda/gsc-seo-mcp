import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { google } from "googleapis";
import { createContainedGscMcpServer } from "./app/bootstrap.js";
import type { AppConfig, GscService } from "./types.js";
import { READONLY_SCOPE, UserFacingError } from "./types.js";
import { requireGoogleOAuthConfig } from "./config.js";
import { FileTokenStore, type StoredCredentials, type TokenStore } from "./auth/token-store.js";
import { GoogleSearchConsoleClient, type RawSearchConsoleClient } from "./google-client.js";
import type { Logger } from "./security.js";

interface RuntimeService {
  service: GscService;
}

function requireReadOnlyContainment(mode: unknown): void {
  if (mode !== "read_only") {
    throw new UserFacingError("WP-00 containment supports only GSC_SEO_MCP_MODE=read_only.");
  }
}

function requestedScopes(mode: unknown): string[] {
  requireReadOnlyContainment(mode);
  return [READONLY_SCOPE];
}

function snapshotRuntimeConfig(config: AppConfig): AppConfig {
  requireReadOnlyContainment(config.mode);
  return Object.freeze({
    authMode: config.authMode,
    mode: config.mode,
    allowedProperties: Object.freeze([...config.allowedProperties]),
    tokenStorePath: config.tokenStorePath,
    requestTimeoutMs: config.requestTimeoutMs,
    totalDeadlineMs: config.totalDeadlineMs,
    ...(config.googleClientId === undefined ? {} : { googleClientId: config.googleClientId }),
    ...(config.googleClientSecret === undefined ? {} : { googleClientSecret: config.googleClientSecret })
  });
}

function createOAuthClient(config: AppConfig, redirectUri?: string) {
  const { clientId, clientSecret } = requireGoogleOAuthConfig(config);
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function validateOAuthCallback(url: URL, expectedState: string): string {
  if (url.pathname !== "/oauth2callback") {
    throw new Error("Invalid OAuth callback path");
  }
  const error = url.searchParams.get("error");
  if (error) {
    throw new Error(`OAuth provider returned an error: ${error}`);
  }
  const state = url.searchParams.get("state");
  if (!state || !safeEqual(state, expectedState)) {
    throw new Error("Invalid OAuth state");
  }
  const code = url.searchParams.get("code");
  if (!code) {
    throw new Error("Missing OAuth code");
  }
  return code;
}

function createRuntimeService(config: AppConfig, store?: TokenStore, logger?: Logger): RuntimeService {
  requireReadOnlyContainment(config.mode);
  const tokenStore = store ?? new FileTokenStore(config.tokenStorePath);
  let client: GoogleSearchConsoleClient | undefined;

  function createAdcClient(): GoogleSearchConsoleClient {
    const auth = new google.auth.GoogleAuth({ scopes: requestedScopes(config.mode) });
    return new GoogleSearchConsoleClient(
      google.searchconsole({ version: "v1", auth }) as unknown as RawSearchConsoleClient,
      { timeoutMs: config.requestTimeoutMs }
    );
  }

  async function loadStoredCredentials(): Promise<StoredCredentials> {
    const stored = await tokenStore.load();
    if (!stored) {
      throw new UserFacingError(`No Google credentials found. Run "gsc-seo-mcp auth login" before calling Search Console tools.`);
    }
    return stored;
  }

  async function getClient(): Promise<GoogleSearchConsoleClient> {
    if (client) return client;
    if (config.authMode === "adc") {
      client = createAdcClient();
      return client;
    }
    const stored = await loadStoredCredentials();
    const oauth = createOAuthClient(config);
    const sanitizedTokens = Object.fromEntries(
      Object.entries(stored.tokens).filter((entry): entry is [string, string | number] => entry[1] !== null && entry[1] !== undefined)
    ) as Parameters<typeof oauth.setCredentials>[0];
    oauth.setCredentials(sanitizedTokens);
    oauth.on("tokens", (tokens) => {
      void (async () => {
        try {
          const current = await tokenStore.load();
          await tokenStore.save({
            tokens: { ...(current?.tokens ?? stored.tokens), ...tokens },
            scopes: current?.scopes ?? stored.scopes
          });
        } catch (error) {
          logger?.error(`Failed to persist refreshed Google token: ${error instanceof Error ? error.message : String(error)}`);
        }
      })();
    });
    client = new GoogleSearchConsoleClient(
      google.searchconsole({ version: "v1", auth: oauth }) as unknown as RawSearchConsoleClient,
      { timeoutMs: config.requestTimeoutMs }
    );
    return client;
  }

  return {
    service: {
      listSites: async (signal) => (await getClient()).listSites(signal),
      searchAnalytics: async (input, signal) => (await getClient()).searchAnalytics(input, signal),
      listSitemaps: async (siteUrl, signal) => (await getClient()).listSitemaps(siteUrl, signal),
      inspectUrl: async (input, signal) => (await getClient()).inspectUrl(input, signal)
    }
  };
}

export function createRuntimeMcpServer(config: AppConfig, store?: TokenStore, logger?: Logger): McpServer {
  const runtimeConfig = snapshotRuntimeConfig(config);
  let runtime: RuntimeService | undefined;
  return createContainedGscMcpServer({
    mode: runtimeConfig.mode,
    allowedProperties: runtimeConfig.allowedProperties,
    requestTimeoutMs: runtimeConfig.requestTimeoutMs,
    totalDeadlineMs: runtimeConfig.totalDeadlineMs,
    getService: () => {
      runtime ??= createRuntimeService(runtimeConfig, store, logger);
      return runtime.service;
    }
  });
}

export async function runLocalOAuthLogin(config: AppConfig, store: TokenStore, logger: Logger): Promise<void> {
  requireReadOnlyContainment(config.mode);
  if (config.authMode === "adc") {
    throw new Error(
      "auth login is not used when GSC_SEO_MCP_AUTH_MODE=adc. Run gcloud auth application-default login with the Search Console scope instead."
    );
  }
  requireGoogleOAuthConfig(config);
  const scopes = requestedScopes(config.mode);
  const state = randomBytes(32).toString("base64url");
  await new Promise<void>((resolve, reject) => {
    const callbackServer = createServer();
    callbackServer.on("request", (req, res) => {
      void (async () => {
        try {
          const address = callbackServer.address();
          if (!address || typeof address === "string") throw new Error("OAuth callback server address unavailable");
          const url = new URL(req.url ?? "/", `http://127.0.0.1:${address.port}`);
          if (url.pathname !== "/oauth2callback") {
            res.writeHead(404).end("Not found");
            return;
          }
          let code: string;
          try {
            code = validateOAuthCallback(url, state);
          } catch (error) {
            res.writeHead(400).end(error instanceof Error ? error.message : "Invalid OAuth callback");
            return;
          }
          const oauth = createOAuthClient(config, `http://127.0.0.1:${address.port}/oauth2callback`);
          const response = await oauth.getToken(code);
          await store.save({ tokens: response.tokens, scopes });
          res.writeHead(200, { "content-type": "text/plain" }).end("Google Search Console credentials saved. You can close this tab.");
          callbackServer.close();
          resolve();
        } catch (error) {
          res.writeHead(500).end("OAuth login failed");
          callbackServer.close();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
    callbackServer.listen(0, "127.0.0.1", () => {
      const address = callbackServer.address();
      if (!address || typeof address === "string") {
        callbackServer.close();
        reject(new Error("OAuth callback server address unavailable"));
        return;
      }
      const oauth = createOAuthClient(config, `http://127.0.0.1:${address.port}/oauth2callback`);
      const authUrl = oauth.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        state,
        scope: scopes
      });
      logger.info(`Open this URL to authorize Google Search Console access: ${authUrl}`);
    });
  });
}
