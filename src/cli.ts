#!/usr/bin/env node
import { FileTokenStore, getAuthStatus } from "./auth/token-store.js";
import { requireAllowedProperties, resolveConfig, type ConfigFlags } from "./config.js";
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

function parseFlags(args: string[]): ConfigFlags {
  const flags: ConfigFlags = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current?.startsWith("--")) continue;
    const [name, inlineValue] = current.split("=", 2);
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
      flags: parseFlags(commandFlags(subcommand, ...rest)),
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
      flags: parseFlags(rest),
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
