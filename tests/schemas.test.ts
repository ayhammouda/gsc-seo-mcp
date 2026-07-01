import { describe, expect, it } from "vitest";
import {
  inspectUrlInputSchema,
  searchAnalyticsInputSchema,
  submitSitemapInputSchema
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
        row_limit: 25001
      })
    ).toThrow();
  });

  it("requires inspected URLs to belong to URL-prefix properties", () => {
    expect(() =>
      inspectUrlInputSchema.parse({
        site_url: "https://example.com/",
        inspection_url: "https://other.example/page",
        language_code: "en-US"
      })
    ).toThrow(/under site_url/);

    expect(
      inspectUrlInputSchema.parse({
        site_url: "sc-domain:example.com",
        inspection_url: "https://docs.example.com/page"
      }).language_code
    ).toBe("en-US");
  });

  it("validates sitemap submission URLs", () => {
    expect(() => submitSitemapInputSchema.parse({ site_url: "", sitemap_url: "nope" })).toThrow();
  });
});

