import * as z from "zod/v4";
import { describe, expect, it } from "vitest";
import { GSC_TOOL_NAMES } from "../src/mcp-server.js";
import { toolSchemaContracts } from "../src/schemas.js";

describe("tool schema contracts", () => {
  it("covers every public MCP tool with input and output schemas", () => {
    expect(Object.keys(toolSchemaContracts).sort()).toEqual([...GSC_TOOL_NAMES].sort());
  });

  it("converts every tool schema to JSON Schema", () => {
    for (const [toolName, contract] of Object.entries(toolSchemaContracts)) {
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
});
