import { describe, expect, it } from "vitest";
import { GoogleSearchConsoleClient } from "../src/google-client.js";

describe("GoogleSearchConsoleClient", () => {
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
});
