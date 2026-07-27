import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as z from "zod/v4";
import { describe, expect, it } from "vitest";
import { GSC_TOOL_NAMES, GSC_TOOL_SCHEMA_CONTRACTS } from "../src/kernel/index.js";

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

function generatedContracts(): Record<string, { input: unknown; output: unknown }> {
  return Object.fromEntries(
    Object.entries(GSC_TOOL_SCHEMA_CONTRACTS).map(([toolName, contract]) => [
      toolName,
      {
        input: z.toJSONSchema(contract.input, { unrepresentable: "any" }),
        output: z.toJSONSchema(contract.output, { unrepresentable: "any" })
      }
    ])
  );
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

  it("matches the reviewed-current WP-02 contract fixture", () => {
    const fixture = JSON.parse(readFileSync(WP_02_CONTRACT_FIXTURE, "utf8")) as unknown;

    expect(generatedContracts()).toEqual(fixture);
  });
});
