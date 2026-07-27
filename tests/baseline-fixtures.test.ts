import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as z from "zod/v4";
import { describe, expect, it } from "vitest";
import { READONLY_SCOPE, WRITE_SCOPE } from "../src/types.js";

const discoveryMethodSchema = z.object({
  id: z.string().min(1),
  httpMethod: z.enum(["GET", "POST", "PUT", "DELETE"]),
  path: z.string().min(1),
  scopes: z.array(z.string()).min(1),
  request: z.string().optional(),
  response: z.string().optional()
});

const sourceDiscoveryMethodSchema = z.object({
  id: z.string().min(1),
  httpMethod: z.enum(["GET", "POST", "PUT", "DELETE"]),
  path: z.string().min(1),
  scopes: z.array(z.string()).min(1),
  request: z.object({ $ref: z.string() }).optional(),
  response: z.object({ $ref: z.string() }).optional()
});

const sourceDiscoverySchema = z.object({
  id: z.literal("searchconsole:v1"),
  revision: z.string().min(1),
  version: z.literal("v1"),
  resources: z.object({
    sites: z.object({ methods: z.object({ list: sourceDiscoveryMethodSchema }) }),
    searchanalytics: z.object({ methods: z.object({ query: sourceDiscoveryMethodSchema }) }),
    sitemaps: z.object({
      methods: z.object({
        list: sourceDiscoveryMethodSchema,
        submit: sourceDiscoveryMethodSchema
      })
    }),
    urlInspection: z.object({
      resources: z.object({
        index: z.object({ methods: z.object({ inspect: sourceDiscoveryMethodSchema }) })
      })
    })
  })
});

const discoveryBaselineSchema = z.object({
  snapshot: z.object({
    source: z.url(),
    retrievedAt: z.iso.date(),
    documentFile: z.literal("searchconsole-v1.discovery.json"),
    fileSha256: z.string().regex(/^[a-f0-9]{64}$/),
    canonicalDocumentSha256: z.string().regex(/^[a-f0-9]{64}$/)
  }),
  document: z.object({
    id: z.literal("searchconsole:v1"),
    revision: z.string().min(1),
    version: z.literal("v1"),
    rootUrl: z.literal("https://searchconsole.googleapis.com/"),
    servicePath: z.literal(""),
    protocol: z.literal("rest"),
    scopes: z.object({
      readOnly: z.literal(READONLY_SCOPE),
      operator: z.literal(WRITE_SCOPE)
    }),
    methods: z.record(z.string(), discoveryMethodSchema)
  })
});

const performanceBaselineSchema = z.object({
  capturedAt: z.iso.date(),
  purpose: z.string().min(1),
  auditedBaselineSha: z.string().regex(/^[a-f0-9]{40}$/),
  environment: z.object({
    node: z.string().min(1),
    platform: z.string().min(1),
    architecture: z.string().min(1),
    cpu: z.string().min(1)
  }),
  measurements: z.object({
    fullTestSuite: z.object({
      command: z.literal("npm test"),
      testFilesPassed: z.int().positive(),
      testFilesSkipped: z.int().nonnegative(),
      testsPassed: z.int().positive(),
      testsSkipped: z.int().nonnegative(),
      vitestDurationMs: z.int().positive(),
      observedWallTimeMs: z.int().positive()
    }),
    packageDryRun: z.object({
      command: z.literal("npm pack --dry-run --json --ignore-scripts"),
      entryCount: z.int().positive(),
      packedBytes: z.int().positive(),
      unpackedBytes: z.int().positive(),
      sha1: z.string().regex(/^[a-f0-9]{40}$/),
      integrity: z.string().startsWith("sha512-")
    })
  })
});

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, sortJson(entry)])
  );
}

describe("WP-00 baseline fixtures", () => {
  it("pins the reviewed Search Console discovery surface and scope split", () => {
    const manifestRaw = JSON.parse(
      readFileSync(new URL("./fixtures/google/searchconsole-v1.discovery-baseline.json", import.meta.url), "utf8")
    ) as unknown;
    const baseline = discoveryBaselineSchema.parse(manifestRaw);
    const snapshotText = readFileSync(
      new URL(`./fixtures/google/${baseline.snapshot.documentFile}`, import.meta.url),
      "utf8"
    );
    const snapshotRaw = JSON.parse(snapshotText) as unknown;
    const snapshotFileHash = createHash("sha256").update(snapshotText).digest("hex");
    const canonicalSnapshotHash = createHash("sha256")
      .update(`${JSON.stringify(sortJson(snapshotRaw))}\n`)
      .digest("hex");

    expect(snapshotFileHash).toBe(baseline.snapshot.fileSha256);
    expect(canonicalSnapshotHash).toBe(baseline.snapshot.canonicalDocumentSha256);
    const source = sourceDiscoverySchema.parse(snapshotRaw);
    expect(source).toMatchObject({
      id: baseline.document.id,
      revision: baseline.document.revision,
      version: baseline.document.version
    });

    const sourceMethods = {
      "sites.list": source.resources.sites.methods.list,
      "searchanalytics.query": source.resources.searchanalytics.methods.query,
      "sitemaps.list": source.resources.sitemaps.methods.list,
      "sitemaps.submit": source.resources.sitemaps.methods.submit,
      "urlInspection.index.inspect": source.resources.urlInspection.resources.index.methods.inspect
    };
    for (const [methodName, sourceMethod] of Object.entries(sourceMethods)) {
      const manifestMethod = baseline.document.methods[methodName];
      expect(manifestMethod).toBeDefined();
      expect(sourceMethod).toMatchObject({
        id: manifestMethod?.id,
        httpMethod: manifestMethod?.httpMethod,
        path: manifestMethod?.path,
        scopes: manifestMethod?.scopes
      });
      expect(sourceMethod.request?.$ref).toBe(manifestMethod?.request);
      expect(sourceMethod.response?.$ref).toBe(manifestMethod?.response);
    }

    const readMethods = [
      "sites.list",
      "searchanalytics.query",
      "sitemaps.list",
      "urlInspection.index.inspect"
    ];
    for (const methodName of readMethods) {
      expect(baseline.document.methods[methodName]?.scopes).toContain(READONLY_SCOPE);
    }
    expect(baseline.document.methods["sitemaps.submit"]?.scopes).toEqual([WRITE_SCOPE]);
  });

  it("records a reproducible reference performance baseline", () => {
    const raw = JSON.parse(
      readFileSync(new URL("./fixtures/performance/wp-00-baseline.json", import.meta.url), "utf8")
    ) as unknown;
    const baseline = performanceBaselineSchema.parse(raw);

    expect(baseline.auditedBaselineSha).toBe("b01d86d9820cd940f4077d32244c1685e6aeb572");
    expect(baseline.measurements.packageDryRun.unpackedBytes).toBeGreaterThan(
      baseline.measurements.packageDryRun.packedBytes
    );
  });
});
