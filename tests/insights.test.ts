import { describe, expect, it } from "vitest";
import { computeDecliningPages, computeKeywordOpportunities } from "../src/insights.js";
import type { SearchAnalyticsRow } from "../src/types.js";

describe("computeDecliningPages", () => {
  it("compares current and previous page rows and ranks click losses", () => {
    const current: SearchAnalyticsRow[] = [
      { keys: ["/a"], clicks: 10, impressions: 200, ctr: 0.05, position: 6 },
      { keys: ["/b"], clicks: 9, impressions: 100, ctr: 0.09, position: 4 },
      { keys: ["/new"], clicks: 0, impressions: 300, ctr: 0, position: 9 }
    ];
    const previous: SearchAnalyticsRow[] = [
      { keys: ["/a"], clicks: 25, impressions: 250, ctr: 0.1, position: 3 },
      { keys: ["/b"], clicks: 10, impressions: 90, ctr: 0.11, position: 4 }
    ];

    const result = computeDecliningPages(current, previous, { minImpressions: 50, limit: 10 });

    expect(result).toHaveLength(2);
    expect(result[0]?.page).toBe("/a");
    expect(result[0]?.deltas.clicks).toBe(-15);
    expect(result[0]?.deltas.position).toBe(3);
    expect(result[0]?.explanation).toMatch(/lost 15 clicks/);
    expect(result.map((row) => row.page)).not.toContain("/new");
  });
});

describe("computeKeywordOpportunities", () => {
  it("finds high-impression low-CTR near-distance queries", () => {
    const rows: SearchAnalyticsRow[] = [
      { keys: ["mcp seo", "https://example.com/a"], clicks: 20, impressions: 2000, ctr: 0.01, position: 8 },
      { keys: ["already good", "https://example.com/b"], clicks: 200, impressions: 1000, ctr: 0.2, position: 4 },
      { keys: ["too low", "https://example.com/c"], clicks: 1, impressions: 5000, ctr: 0.0002, position: 35 }
    ];

    const result = computeKeywordOpportunities(rows, {
      minImpressions: 1000,
      maxCtr: 0.05,
      positionMin: 4,
      positionMax: 20,
      limit: 5
    });

    expect(result).toEqual([
      expect.objectContaining({
        query: "mcp seo",
        page: "https://example.com/a",
        impressions: 2000,
        clicks: 20,
        ctr: 0.01,
        position: 8
      })
    ]);
    expect(result[0]?.opportunityReason).toMatch(/high impressions/i);
  });
});

