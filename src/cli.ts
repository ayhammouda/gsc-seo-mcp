#!/usr/bin/env node
import { FileTokenStore, getAuthStatus } from "./auth/token-store.js";
import { parseCliFlags, requireAllowedProperties, resolveConfig } from "./config.js";
import { GSC_SERVER_VERSION } from "./mcp-server.js";
import { createRuntimeMcpServer, runLocalOAuthLogin } from "./oauth.js";
import { createStderrLogger, redactSecrets } from "./security.js";
import { serveStdio } from "./transport.js";
import { READONLY_SCOPE } from "./types.js";

function printHelp(): void {
  process.stdout.write(`gsc-seo-mcp

Usage:
  gsc-seo-mcp stdio
  gsc-seo-mcp auth login
  gsc-seo-mcp auth status

Options:
  --auth-mode <mode>  "stored" for gsc-seo-mcp auth login tokens, or "adc" for Google ADC
  --mode <mode>       WP-00 containment supports only "read_only"
  --allowed-property  Exact Search Console property; repeat to allow more than one
  --readonly <bool>   Legacy compatibility: only "true" is accepted
  --token-store <p>   Defaults to GSC_SEO_MCP_TOKEN_STORE_PATH
  --version           Show version
  --help              Show this help
`);
}

function commandFlags(...values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

async function main(argv: string[]): Promise<void> {
  const [command, subcommand, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`gsc-seo-mcp ${GSC_SERVER_VERSION}\n`);
    return;
  }

  const logger = createStderrLogger();
  if (command === "stdio") {
    const config = resolveConfig({
      env: process.env,
      flags: parseCliFlags(commandFlags(subcommand, ...rest)),
      onWarning: (message) => logger.warn(message)
    });
    requireAllowedProperties(config);
    const server = createRuntimeMcpServer(config, new FileTokenStore(config.tokenStorePath), logger);
    await serveStdio(server);
    return;
  }

  if (command === "auth") {
    const config = resolveConfig({
      env: process.env,
      flags: parseCliFlags(rest),
      onWarning: (message) => logger.warn(message)
    });
    const store = new FileTokenStore(config.tokenStorePath);
    if (subcommand === "status") {
      if (config.authMode === "adc") {
        process.stdout.write(
          `${JSON.stringify(
            {
              authMode: "adc",
              credentialsSource: "Application Default Credentials",
              scopes: [READONLY_SCOPE]
            },
            null,
            2
          )}\n`
        );
        return;
      }
      process.stdout.write(`${JSON.stringify(await getAuthStatus(store), null, 2)}\n`);
      return;
    }
    if (subcommand === "login") {
      await runLocalOAuthLogin(config, store, logger);
      logger.info("Google Search Console credentials saved.");
      return;
    }
  }

  throw new Error("Unknown command. Run gsc-seo-mcp --help.");
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${redactSecrets(error instanceof Error ? error.message : String(error))}\n`);
  process.exit(1);
});
