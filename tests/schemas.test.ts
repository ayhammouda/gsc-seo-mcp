import { describe, expect, it } from "vitest";
import {
  findKeywordOpportunitiesInputSchema,
  inspectUrlInputSchema,
  searchAnalyticsInputSchema
} from "../src/schemas.js";

describe("tool input schemas", () => {
  it("accepts valid search analytics inputs", () => {
    const parsed = searchAnalyticsInputSchema.parse({
      site_url: "https://example.com/",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      dimensions: ["query", "page"],
      row_limit: 100,
      start_row: 0,
      filters: [
        {
          group_type: "and",
          filters: [{ dimension: "query", operator: "contains", expression: "mcp" }]
        }
      ]
    });

    expect(parsed.dimensions).toEqual(["query", "page"]);
  });

  it("rejects invalid dates, dimensions, duplicate dimensions, and ranges", () => {
    expect(() =>
      searchAnalyticsInputSchema.parse({
        site_url: "https://example.com/",
        start_date: "20260101",
        end_date: "2026-01-31",
        dimensions: ["query"]
      })
    ).toThrow();

    expect(() =>
      searchAnalyticsInputSchema.parse({
        site_url: "https://example.com/",
        start_date: "2026-02-29",
        end_date: "2026-03-01",
        dimensions: ["query"]
      })
    ).toThrow(/valid calendar day/);

    expect(() =>
      searchAnalyticsInputSchema.parse({
        site_url: "https://example.com/",
        start_date: "2026-02-01",
        end_date: "2026-01-31",
        dimensions: ["query"]
      })
    ).toThrow();

    expect(() =>
      searchAnalyticsInputSchema.parse({
        site_url: "https://example.com/",
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        dimensions: ["hour"]
      })
    ).toThrow();

    expect(() =>
      searchAnalyticsInputSchema.parse({
        site_url: "https://example.com/",
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        dimensions: ["query", "query"]
      })
    ).toThrow();

    expect(() =>
      searchAnalyticsInputSchema.parse({
        site_url: "https://example.com/",
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        dimensions: ["query"],
        row_limit: 1001
      })
    ).toThrow();

    expect(() =>
      searchAnalyticsInputSchema.parse({
        site_url: "https://example.com/",
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        row_limit: 2,
        start_row: 24_999
      })
    ).toThrow(/pagination window/);
  });

  it("accepts leap days but rejects unknown input keys", () => {
    expect(
      searchAnalyticsInputSchema.parse({
        site_url: "https://example.com/",
        start_date: "2024-02-29",
        end_date: "2024-02-29"
      }).start_date
    ).toBe("2024-02-29");

    expect(() =>
      searchAnalyticsInputSchema.parse({
        site_url: "https://example.com/",
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        unexpected: true
      })
    ).toThrow(/unrecognized key/i);

    expect(() =>
      inspectUrlInputSchema.parse({
        site_url: "https://example.com/",
        inspection_url: "https://example.com/page",
        unexpected: true
      })
    ).toThrow(/unrecognized key/i);
  });

  it.each([
    ["month boundary", "2026-01-01", "2026-03-31"],
    ["year boundary", "2025-11-02", "2026-01-30"],
    ["leap-day boundary", "2024-01-01", "2024-03-30"]
  ])("accepts 1,000 rows across an exact 90-day inclusive %s", (_label, startDate, endDate) => {
    const parsed = searchAnalyticsInputSchema.parse({
      site_url: "https://example.com/",
      start_date: startDate,
      end_date: endDate,
      row_limit: 1000
    });

    expect(parsed.row_limit).toBe(1000);
    expect(parsed.end_date).toBe(endDate);
  });

  it.each([
    ["month boundary", "2026-01-01", "2026-04-01"],
    ["year boundary", "2025-11-02", "2026-01-31"],
    ["leap-day boundary", "2024-01-01", "2024-03-31"]
  ])("rejects a 91-day inclusive %s", (_label, startDate, endDate) => {
    expect(() =>
      searchAnalyticsInputSchema.parse({
        site_url: "https://example.com/",
        start_date: startDate,
        end_date: endDate
      })
    ).toThrow(/90 inclusive calendar days/);
  });

  it("leaves property containment to the dispatcher rather than the wire schema", () => {
    // The MCP SDK validates inputSchema before the tool callback runs, so a
    // containment refinement here would reject cross-property probes outside the
    // capability kernel and emit no terminal audit event. selectResource owns
    // this rule; tests/tools.test.ts asserts the audited denial.
    expect(
      inspectUrlInputSchema.parse({
        site_url: "https://example.com/",
        inspection_url: "https://other.example/page",
        language_code: "en-US"
      }).inspection_url
    ).toBe("https://other.example/page");

    expect(
      inspectUrlInputSchema.parse({
        site_url: "sc-domain:example.com",
        inspection_url: "https://docs.example.com/page"
      }).language_code
    ).toBe("en-US");
  });

  it("enforces exact Search Analytics filter, expression, and window boundaries", () => {
    const exactFilter = {
      dimension: "query" as const,
      operator: "equals" as const,
      expression: "x".repeat(4_096)
    };
    const exactGroups = Array.from({ length: 4 }, () => ({
      group_type: "and" as const,
      filters: Array.from({ length: 8 }, () => exactFilter)
    }));
    const base = {
      site_url: "https://example.com/",
      start_date: "2026-01-01",
      end_date: "2026-01-01",
      row_limit: 1_000,
      start_row: 24_000,
      filters: exactGroups
    };

    expect(searchAnalyticsInputSchema.parse(base)).toMatchObject({
      row_limit: 1_000,
      start_row: 24_000
    });
    expect(() =>
      searchAnalyticsInputSchema.parse({
        ...base,
        filters: [...exactGroups, exactGroups[0]]
      })
    ).toThrow();
    expect(() =>
      searchAnalyticsInputSchema.parse({
        ...base,
        filters: [
          {
            group_type: "and",
            filters: [...exactGroups[0]!.filters, exactFilter]
          }
        ]
      })
    ).toThrow();
    expect(() =>
      searchAnalyticsInputSchema.parse({
        ...base,
        filters: [
          {
            group_type: "and",
            filters: [{ ...exactFilter, expression: "x".repeat(4_097) }]
          }
        ]
      })
    ).toThrow();
    expect(() =>
      searchAnalyticsInputSchema.parse({ ...base, start_row: 24_001 })
    ).toThrow(/pagination window/);
  });

  it("rejects unknown fields inside filter groups and filters", () => {
    const base = {
      site_url: "https://example.com/",
      start_date: "2026-01-01",
      end_date: "2026-01-01"
    };

    expect(() =>
      searchAnalyticsInputSchema.parse({
        ...base,
        filters: [
          {
            group_type: "and",
            filters: [
              {
                dimension: "query",
                operator: "equals",
                expression: "mcp",
                unexpected: true
              }
            ]
          }
        ]
      })
    ).toThrow(/unrecognized key/i);
    expect(() =>
      searchAnalyticsInputSchema.parse({
        ...base,
        filters: [
          {
            group_type: "and",
            filters: [
              {
                dimension: "query",
                operator: "equals",
                expression: "mcp"
              }
            ],
            unexpected: true
          }
        ]
      })
    ).toThrow(/unrecognized key/i);
  });

  it("enforces the keyword-opportunity position range invariant", () => {
    const base = {
      site_url: "https://example.com/",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      position_min: 4,
      position_max: 4
    };

    expect(findKeywordOpportunitiesInputSchema.parse(base)).toMatchObject({
      position_min: 4,
      position_max: 4
    });
    expect(() =>
      findKeywordOpportunitiesInputSchema.parse({
        ...base,
        position_min: 5,
        position_max: 4
      })
    ).toThrow(/position_min must be less than or equal to position_max/);
  });

  it("accepts well-formed private-use and grandfathered BCP-47 tags", () => {
    for (const languageCode of ["x-private", "i-klingon", "zh-Hant-TW"]) {
      expect(
        inspectUrlInputSchema.parse({
          site_url: "https://example.com/",
          inspection_url: "https://example.com/page",
          language_code: languageCode
        }).language_code
      ).toBe(languageCode);
    }
    expect(() =>
      inspectUrlInputSchema.parse({
        site_url: "https://example.com/",
        inspection_url: "https://example.com/page",
        language_code: "en_US"
      })
    ).toThrow(/BCP-47/);
  });
});
