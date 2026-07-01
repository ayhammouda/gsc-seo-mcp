import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";
import type { AppConfig, GscService } from "./types.js";
import { READONLY_SCOPE, UserFacingError, WRITE_SCOPE } from "./types.js";
import { requireGoogleOAuthConfig } from "./config.js";
import { FileTokenStore, type StoredCredentials, type TokenStore } from "./auth/token-store.js";
import { GoogleSearchConsoleClient, type RawSearchConsoleClient } from "./google-client.js";
import type { Logger } from "./security.js";

export interface RuntimeService {
  service: GscService;
  hasWriteScope(): Promise<boolean>;
}

function requestedScopes(readonly: boolean): string[] {
  return readonly ? [READONLY_SCOPE] : [WRITE_SCOPE];
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

export function createRuntimeService(config: AppConfig, store = new FileTokenStore(config.tokenStorePath), logger?: Logger): RuntimeService {
  let client: GoogleSearchConsoleClient | undefined;

  async function loadStoredCredentials(): Promise<StoredCredentials> {
    const stored = await store.load();
    if (!stored) {
      throw new UserFacingError(`No Google credentials found. Run "gsc-seo-mcp auth login" before calling Search Console tools.`);
    }
    return stored;
  }

  async function getClient(): Promise<GoogleSearchConsoleClient> {
    if (client) return client;
    const stored = await loadStoredCredentials();
    const oauth = createOAuthClient(config);
    const sanitizedTokens = Object.fromEntries(
      Object.entries(stored.tokens).filter((entry): entry is [string, string | number] => entry[1] !== null && entry[1] !== undefined)
    ) as Parameters<typeof oauth.setCredentials>[0];
    oauth.setCredentials(sanitizedTokens);
    oauth.on("tokens", (tokens) => {
      void (async () => {
        try {
          const current = await store.load();
          await store.save({
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
    hasWriteScope: async () => {
      const stored = await store.load();
      return Boolean(stored?.scopes.includes(WRITE_SCOPE));
    },
    service: {
      listSites: async (signal) => (await getClient()).listSites(signal),
      searchAnalytics: async (input, signal) => (await getClient()).searchAnalytics(input, signal),
      listSitemaps: async (siteUrl, signal) => (await getClient()).listSitemaps(siteUrl, signal),
      submitSitemap: async (siteUrl, sitemapUrl, signal) => (await getClient()).submitSitemap(siteUrl, sitemapUrl, signal),
      inspectUrl: async (input, signal) => (await getClient()).inspectUrl(input, signal)
    }
  };
}

export async function runLocalOAuthLogin(config: AppConfig, store: TokenStore, logger: Logger): Promise<void> {
  const scopes = requestedScopes(config.readonly);
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
