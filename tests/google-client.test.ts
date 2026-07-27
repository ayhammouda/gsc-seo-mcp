import { describe, expect, it } from "vitest";
import { GoogleSearchConsoleClient } from "../src/google-client.js";
import {
  MAX_ALLOWLIST_ENTRIES,
  MAX_ANALYTICS_ROWS_PER_REQUEST
} from "../src/kernel/budget-limits.js";

describe("GoogleSearchConsoleClient", () => {
  it.each([0, -1, 30_001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid Google attempt timeout %s",
    (timeoutMs) => {
      expect(
        () => new GoogleSearchConsoleClient({}, { timeoutMs })
      ).toThrow(/attempt timeout/i);
    }
  );

  it("passes timeout and AbortSignal to Search Console calls", async () => {
    const controller = new AbortController();
    const calls: unknown[] = [];
    const rawClient = {
      sites: {
        list: (params: unknown, options: unknown) => {
          calls.push({ params, options });
          return Promise.resolve({ data: { siteEntry: [] } });
        }
      }
    };
    const client = new GoogleSearchConsoleClient(rawClient, { timeoutMs: 1234 });

    await client.listSites(controller.signal);

    expect(calls).toEqual([{ params: {}, options: { signal: controller.signal, timeout: 1234 } }]);
  });

  it("snapshots the validated attempt timeout exactly once", async () => {
    const calls: unknown[] = [];
    let timeoutReads = 0;
    let timeoutValue = 30_000;
    const options = {
      get timeoutMs(): number {
        timeoutReads += 1;
        return timeoutValue;
      }
    };
    const client = new GoogleSearchConsoleClient(
      {
        sites: {
          list: (params, requestOptions) => {
            calls.push({ params, requestOptions });
            return Promise.resolve({ data: { siteEntry: [] } });
          }
        }
      },
      options
    );
    timeoutValue = 600_000;
    const signal = new AbortController().signal;

    await client.listSites(signal);

    expect(timeoutReads).toBe(1);
    expect(calls).toEqual([
      {
        params: {},
        requestOptions: { signal, timeout: 30_000 }
      }
    ]);
  });

  it("rejects an oversized site inventory before mapping it", async () => {
    const entries = Array.from(
      { length: MAX_ALLOWLIST_ENTRIES + 1 },
      () => ({ siteUrl: "https://example.com/" })
    );
    Object.defineProperty(entries[0], "siteUrl", {
      enumerable: true,
      get: () => {
        throw new Error("mapping must not begin");
      }
    });
    const client = new GoogleSearchConsoleClient(
      {
        sites: {
          list: () => Promise.resolve({ data: { siteEntry: entries } })
        }
      },
      { timeoutMs: 1234 }
    );

    await expect(client.listSites(new AbortController().signal)).rejects.toMatchObject({
      code: "budget_output_items_exceeded"
    });
  });

  it("uses the normalized Search Analytics request and rejects rows beyond row_limit before mapping", async () => {
    const calls: unknown[] = [];
    const rows = Array.from({ length: 3 }, () => ({ clicks: 1 }));
    Object.defineProperty(rows[0], "clicks", {
      enumerable: true,
      get: () => {
        throw new Error("mapping must not begin");
      }
    });
    const client = new GoogleSearchConsoleClient(
      {
        searchanalytics: {
          query: (params, options) => {
            calls.push({ params, options });
            return Promise.resolve({ data: { rows } });
          }
        }
      },
      { timeoutMs: 1234 }
    );
    const signal = new AbortController().signal;

    await expect(
      client.searchAnalytics(
        {
          site_url: "https://example.com/",
          start_date: "2026-01-01",
          end_date: "2026-01-02",
          dimensions: ["query"],
          row_limit: 2,
          start_row: 0,
          filters: []
        },
        signal
      )
    ).rejects.toMatchObject({ code: "budget_output_items_exceeded" });
    expect(calls).toEqual([
      {
        params: {
          siteUrl: "https://example.com/",
          requestBody: {
            startDate: "2026-01-01",
            endDate: "2026-01-02",
            dimensions: ["query"],
            rowLimit: 2,
            startRow: 0
          }
        },
        options: { signal, timeout: 1234 }
      }
    ]);
  });

  it("rejects an oversized sitemap inventory before mapping it", async () => {
    const sitemaps = Array.from(
      { length: MAX_ANALYTICS_ROWS_PER_REQUEST + 1 },
      () => ({ path: "https://example.com/sitemap.xml" })
    );
    Object.defineProperty(sitemaps[0], "path", {
      enumerable: true,
      get: () => {
        throw new Error("mapping must not begin");
      }
    });
    const client = new GoogleSearchConsoleClient(
      {
        sitemaps: {
          list: () => Promise.resolve({ data: { sitemap: sitemaps } })
        }
      },
      { timeoutMs: 1234 }
    );

    await expect(
      client.listSitemaps("https://example.com/", new AbortController().signal)
    ).rejects.toMatchObject({ code: "budget_output_items_exceeded" });
  });
});
