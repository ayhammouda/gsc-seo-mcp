import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import * as z from "zod/v4";
import { describe, expect, it } from "vitest";
import { createContainedGscMcpServer } from "../src/app/bootstrap.js";
import { GSC_TOOL_NAMES, GSC_TOOL_SCHEMA_CONTRACTS } from "../src/kernel/index.js";
import type { GscService } from "../src/types.js";

const WP_00_CONTRACT_FIXTURE = new URL(
  "./fixtures/contracts/wp-00-tool-contracts.json",
  import.meta.url
);
const WP_02_CONTRACT_FIXTURE = new URL(
  "./fixtures/contracts/wp-02-tool-contracts.json",
  import.meta.url
);
const WP_00_CONTRACT_FIXTURE_SHA256 =
  "45e024a09a3bdb7fe049b9c9459de90fb5324f0237a6b52591528edbe3b2ff9e";

const unusedService: GscService = {
  listSites: () => Promise.resolve({ sites: [] }),
  searchAnalytics: () => Promise.resolve({ rows: [], note: "" }),
  listSitemaps: () => Promise.resolve({ sitemaps: [] }),
  inspectUrl: () => Promise.resolve({ indexStatus: {} })
};

/**
 * Capture the contract clients actually receive rather than re-deriving it.
 * The MCP SDK advertises input schemas with `pipeStrategy: "input"` and output
 * schemas with `pipeStrategy: "output"`; a fixture generated from a different
 * projection disagrees about which fields are required and pins evidence no
 * client ever sees.
 */
async function advertisedContracts(): Promise<Record<string, { input: unknown; output: unknown }>> {
  const server = createContainedGscMcpServer({
    mode: "read_only",
    allowedProperties: ["https://example.com/"],
    requestTimeoutMs: 30_000,
    totalDeadlineMs: 45_000,
    getService: () => unusedService
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "schema-contract", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    return Object.fromEntries(
      tools.map((tool) => [tool.name, { input: tool.inputSchema, output: tool.outputSchema }])
    );
  } finally {
    await client.close();
    await server.close();
  }
}

describe("tool schema contracts", () => {
  it("covers every public MCP tool with input and output schemas", () => {
    expect(Object.keys(GSC_TOOL_SCHEMA_CONTRACTS).sort()).toEqual([...GSC_TOOL_NAMES].sort());
  });

  it("converts every tool schema to JSON Schema", () => {
    for (const [toolName, contract] of Object.entries(GSC_TOOL_SCHEMA_CONTRACTS)) {
      const inputSchema = z.toJSONSchema(contract.input, { unrepresentable: "any" });
      const outputSchema = z.toJSONSchema(contract.output, { unrepresentable: "any" });

      expect(inputSchema).toMatchObject({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object"
      });
      expect(outputSchema).toMatchObject({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object"
      });
      expect(toolName).toMatch(/^gsc_/);
    }
  });

  it("preserves the frozen WP-00 contract fixture byte-for-byte", () => {
    const fixtureBytes = readFileSync(WP_00_CONTRACT_FIXTURE);

    expect(createHash("sha256").update(fixtureBytes).digest("hex")).toBe(
      WP_00_CONTRACT_FIXTURE_SHA256
    );
  });

  it("matches the reviewed-current WP-02 contract fixture", async () => {
    const fixture = JSON.parse(readFileSync(WP_02_CONTRACT_FIXTURE, "utf8")) as unknown;

    expect(await advertisedContracts()).toEqual(fixture);
  });

  it("advertises defaulted input fields as optional over the wire", async () => {
    const advertised = await advertisedContracts();
    const inspectInput = advertised.gsc_inspect_url?.input as { required?: string[] };
    const analyticsInput = advertised.gsc_search_analytics?.input as { required?: string[] };

    expect(inspectInput.required).toEqual(["site_url", "inspection_url"]);
    expect(analyticsInput.required).toEqual(["site_url", "start_date", "end_date"]);
  });
});
