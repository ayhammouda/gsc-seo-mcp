import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  GSC_TOOL_NAMES,
  isCapabilityDispatcher,
  listCapabilitiesForDispatcher
} from "./kernel/index.js";
import type {
  CallerIdentity,
  CapabilityDispatcher
} from "./kernel/index.js";

export const GSC_SERVER_NAME = "gsc-seo-mcp";
export const GSC_SERVER_VERSION = "0.1.0";
export { GSC_TOOL_NAMES };

export interface GscMcpServerDependencies {
  readonly dispatcher: CapabilityDispatcher;
  readonly identity: CallerIdentity;
}

function requireDispatcher(input: unknown): CapabilityDispatcher {
  if (!isCapabilityDispatcher(input)) {
    throw new Error("MCP registration requires a capability dispatcher.");
  }
  return input;
}

function requireIdentity(input: unknown): CallerIdentity {
  if (
    typeof input !== "object" ||
    input === null ||
    !("actorId" in input) ||
    typeof input.actorId !== "string" ||
    input.actorId.length === 0 ||
    !("tenantId" in input) ||
    typeof input.tenantId !== "string" ||
    input.tenantId.length === 0
  ) {
    throw new Error("MCP registration requires a caller identity.");
  }
  return Object.freeze({ actorId: input.actorId, tenantId: input.tenantId });
}

export function createGscMcpServer(input: GscMcpServerDependencies): McpServer {
  const dispatcher = requireDispatcher(input?.dispatcher);
  const identity = requireIdentity(input?.identity);
  const capabilities = listCapabilitiesForDispatcher(dispatcher);
  if (capabilities.length === 0) {
    throw new Error("No capabilities are available for the dispatcher deployment profile.");
  }

  const server = new McpServer({ name: GSC_SERVER_NAME, version: GSC_SERVER_VERSION });
  for (const capability of capabilities) {
    server.registerTool(
      capability.name,
      {
        title: capability.title,
        description: capability.description,
        inputSchema: capability.inputSchema,
        outputSchema: capability.outputSchema,
        annotations: capability.annotations
      },
      async (toolInput, extra) =>
        dispatcher.dispatch({
          toolName: capability.name,
          input: toolInput,
          identity,
          signal: extra.signal
        })
    );
  }

  return server;
}
