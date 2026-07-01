import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { computeDecliningPages, computeKeywordOpportunities } from "./insights.js";
import {
  findDecliningPagesInputSchema,
  findKeywordOpportunitiesInputSchema,
  inspectUrlInputSchema,
  listSitemapsInputSchema,
  searchAnalyticsInputSchema,
  submitSitemapInputSchema
} from "./schemas.js";
import type {
  DecliningPage,
  GscService,
  InspectUrlOutput,
  KeywordOpportunity
} from "./types.js";
import { UserFacingError, WRITE_SCOPE } from "./types.js";

export const GSC_TOOL_NAMES = [
  "gsc_list_sites",
  "gsc_search_analytics",
  "gsc_list_sitemaps",
  "gsc_submit_sitemap",
  "gsc_inspect_url",
  "gsc_find_declining_pages",
  "gsc_find_keyword_opportunities"
] as const;

interface ToolExtra {
  signal: AbortSignal;
}

export interface ToolHandlerDeps {
  service: GscService;
  readonly: boolean;
  requestTimeoutMs?: number;
  hasWriteScope?: () => Promise<boolean>;
}

export type GscServerDeps = ToolHandlerDeps;

const searchRowSchema = z.object({
  keys: z.array(z.string()),
  clicks: z.number(),
  impressions: z.number(),
  ctr: z.number(),
  position: z.number()
});

const listSitesOutputSchema = z.object({
  sites: z.array(
    z.object({
      siteUrl: z.string(),
      permissionLevel: z.string().optional()
    })
  )
});

const searchAnalyticsOutputSchema = z.object({
  rows: z.array(searchRowSchema),
  note: z.string()
});

const listSitemapsOutputSchema = z.object({
  sitemaps: z.array(
    z.object({
      path: z.string(),
      lastSubmitted: z.string().optional(),
      lastDownloaded: z.string().optional(),
      warnings: z.number().optional(),
      errors: z.number().optional(),
      isPending: z.boolean().optional(),
      isSitemapsIndex: z.boolean().optional(),
      type: z.string().optional(),
      contents: z
        .array(
          z.object({
            type: z.string().optional(),
            submitted: z.number().optional(),
            indexed: z.number().optional()
          })
        )
        .optional()
    })
  )
});

const submitSitemapOutputSchema = z.object({
  submitted: z.boolean(),
  siteUrl: z.string(),
  sitemapUrl: z.string()
});

const inspectUrlOutputSchema: z.ZodType<InspectUrlOutput> = z.object({
  inspectionResultLink: z.string().optional(),
  indexStatus: z.object({
    verdict: z.string().optional(),
    coverageState: z.string().optional(),
    robotsTxtState: z.string().optional(),
    indexingState: z.string().optional(),
    pageFetchState: z.string().optional(),
    googleCanonical: z.string().optional(),
    userCanonical: z.string().optional(),
    lastCrawlTime: z.string().optional(),
    crawledAs: z.string().optional(),
    sitemap: z.array(z.string()).optional(),
    referringUrls: z.array(z.string()).optional()
  }),
  mobileUsability: z.unknown().optional(),
  richResults: z.unknown().optional(),
  amp: z.unknown().optional()
});

const decliningPageSchema: z.ZodType<DecliningPage> = z.object({
  page: z.string(),
  current: searchRowSchema,
  previous: searchRowSchema,
  deltas: z.object({
    clicks: z.number(),
    impressions: z.number(),
    ctr: z.number(),
    position: z.number()
  }),
  explanation: z.string()
});

const keywordOpportunitySchema: z.ZodType<KeywordOpportunity> = z.object({
  query: z.string(),
  page: z.string().optional(),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  position: z.number(),
  opportunityReason: z.string()
});

const decliningPagesOutputSchema = z.object({ pages: z.array(decliningPageSchema) });
const keywordOpportunitiesOutputSchema = z.object({ opportunities: z.array(keywordOpportunitySchema) });

function success(structuredContent: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent
  };
}

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

function signalWithTimeout(signal: AbortSignal, timeoutMs: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
}

async function runTool<T extends object>(action: () => Promise<T>): Promise<CallToolResult> {
  try {
    return success((await action()) as Record<string, unknown>);
  } catch (error) {
    return toolError(error);
  }
}

export function createToolHandlers(deps: ToolHandlerDeps) {
  const timeoutMs = deps.requestTimeoutMs ?? 30_000;
  const hasWriteScope = deps.hasWriteScope ?? (() => Promise.resolve(true));

  return {
    gsc_list_sites: (_input: Record<string, never>, extra: ToolExtra) =>
      runTool(() => deps.service.listSites(signalWithTimeout(extra.signal, timeoutMs))),

    gsc_search_analytics: async (input: unknown, extra: ToolExtra) =>
      runTool(async () => deps.service.searchAnalytics(searchAnalyticsInputSchema.parse(input), signalWithTimeout(extra.signal, timeoutMs))),

    gsc_list_sitemaps: async (input: unknown, extra: ToolExtra) =>
      runTool(async () => {
        const parsed = listSitemapsInputSchema.parse(input);
        return deps.service.listSitemaps(parsed.site_url, signalWithTimeout(extra.signal, timeoutMs));
      }),

    gsc_submit_sitemap: async (input: unknown, extra: ToolExtra) =>
      runTool(async () => {
        const parsed = submitSitemapInputSchema.parse(input);
        if (deps.readonly) {
          throw new UserFacingError(
            "gsc_submit_sitemap is disabled because GSC_SEO_MCP_READONLY defaults to true. Set GSC_SEO_MCP_READONLY=false and run auth login with write scope to submit sitemaps."
          );
        }
        if (!(await hasWriteScope())) {
          throw new UserFacingError(`Stored credentials do not include required write scope ${WRITE_SCOPE}. Run auth login with GSC_SEO_MCP_READONLY=false.`);
        }
        await deps.service.submitSitemap(parsed.site_url, parsed.sitemap_url, signalWithTimeout(extra.signal, timeoutMs));
        return { submitted: true, siteUrl: parsed.site_url, sitemapUrl: parsed.sitemap_url };
      }),

    gsc_inspect_url: async (input: unknown, extra: ToolExtra) =>
      runTool(async () => deps.service.inspectUrl(inspectUrlInputSchema.parse(input), signalWithTimeout(extra.signal, timeoutMs))),

    gsc_find_declining_pages: async (input: unknown, extra: ToolExtra) =>
      runTool(async () => {
        const parsed = findDecliningPagesInputSchema.parse(input);
        const signal = signalWithTimeout(extra.signal, timeoutMs);
        const [current, previous] = await Promise.all([
          deps.service.searchAnalytics(
            {
              site_url: parsed.site_url,
              start_date: parsed.current_start_date,
              end_date: parsed.current_end_date,
              dimensions: ["page"],
              row_limit: 25_000,
              start_row: 0,
              filters: []
            },
            signal
          ),
          deps.service.searchAnalytics(
            {
              site_url: parsed.site_url,
              start_date: parsed.previous_start_date,
              end_date: parsed.previous_end_date,
              dimensions: ["page"],
              row_limit: 25_000,
              start_row: 0,
              filters: []
            },
            signal
          )
        ]);
        return {
          pages: computeDecliningPages(current.rows, previous.rows, {
            minImpressions: parsed.min_impressions,
            limit: parsed.limit
          })
        };
      }),

    gsc_find_keyword_opportunities: async (input: unknown, extra: ToolExtra) =>
      runTool(async () => {
        const parsed = findKeywordOpportunitiesInputSchema.parse(input);
        const response = await deps.service.searchAnalytics(
          {
            site_url: parsed.site_url,
            start_date: parsed.start_date,
            end_date: parsed.end_date,
            dimensions: ["query", "page"],
            row_limit: 25_000,
            start_row: 0,
            filters: []
          },
          signalWithTimeout(extra.signal, timeoutMs)
        );
        return {
          opportunities: computeKeywordOpportunities(response.rows, {
            minImpressions: parsed.min_impressions,
            maxCtr: parsed.max_ctr,
            positionMin: parsed.position_min,
            positionMax: parsed.position_max,
            limit: parsed.limit
          })
        };
      })
  };
}

export function createGscMcpServer(deps: GscServerDeps): McpServer {
  const server = new McpServer({ name: "gsc-seo-mcp", version: "0.1.0" });
  const handlers = createToolHandlers(deps);

  server.registerTool(
    "gsc_list_sites",
    {
      title: "List Search Console Sites",
      description: "List Search Console properties for the authenticated account.",
      inputSchema: z.object({}),
      outputSchema: listSitesOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (input, extra) => handlers.gsc_list_sites(input, extra)
  );

  server.registerTool(
    "gsc_search_analytics",
    {
      title: "Query Search Analytics",
      description: "Query Search Console search performance rows. Results are sorted by click count and may not include every possible row.",
      inputSchema: searchAnalyticsInputSchema,
      outputSchema: searchAnalyticsOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (input, extra) => handlers.gsc_search_analytics(input, extra)
  );

  server.registerTool(
    "gsc_list_sitemaps",
    {
      title: "List Sitemaps",
      description: "List submitted Search Console sitemaps for a property.",
      inputSchema: listSitemapsInputSchema,
      outputSchema: listSitemapsOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (input, extra) => handlers.gsc_list_sitemaps(input, extra)
  );

  server.registerTool(
    "gsc_submit_sitemap",
    {
      title: "Submit Sitemap",
      description: "Submit a sitemap to Google Search Console. Requires write scope and readonly mode disabled.",
      inputSchema: submitSitemapInputSchema,
      outputSchema: submitSitemapOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }
    },
    async (input, extra) => handlers.gsc_submit_sitemap(input, extra)
  );

  server.registerTool(
    "gsc_inspect_url",
    {
      title: "Inspect URL",
      description: "Inspect a URL's Google index status using the URL Inspection API.",
      inputSchema: inspectUrlInputSchema,
      outputSchema: inspectUrlOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (input, extra) => handlers.gsc_inspect_url(input, extra)
  );

  server.registerTool(
    "gsc_find_declining_pages",
    {
      title: "Find Declining Pages",
      description: "Compare two Search Console date ranges and surface pages with declining SEO performance.",
      inputSchema: findDecliningPagesInputSchema,
      outputSchema: decliningPagesOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (input, extra) => handlers.gsc_find_declining_pages(input, extra)
  );

  server.registerTool(
    "gsc_find_keyword_opportunities",
    {
      title: "Find Keyword Opportunities",
      description: "Find high-impression, low-CTR, near-striking-distance query opportunities.",
      inputSchema: findKeywordOpportunitiesInputSchema,
      outputSchema: keywordOpportunitiesOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (input, extra) => handlers.gsc_find_keyword_opportunities(input, extra)
  );

  return server;
}
