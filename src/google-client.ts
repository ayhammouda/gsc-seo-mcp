import type {
  GscService,
  InspectUrlOutput,
  SearchAnalyticsOutput,
  SearchAnalyticsRow,
  SiteEntry,
  SitemapContent,
  SitemapEntry
} from "./types.js";
import type { InspectUrlInput, SearchAnalyticsInput } from "./schemas.js";
import {
  BudgetLimitError,
  MAX_ALLOWLIST_ENTRIES,
  MAX_ANALYTICS_ROWS_PER_REQUEST,
  READ_ATTEMPT_TIMEOUT_MS
} from "./kernel/budget-limits.js";

interface GoogleRequestOptions {
  signal: AbortSignal;
  timeout: number;
}

interface GoogleResponse<T> {
  data: T;
}

type GoogleCall<T> = (params: unknown, options: GoogleRequestOptions) => Promise<GoogleResponse<T>>;

interface RawSiteEntry {
  siteUrl?: string | null;
  permissionLevel?: string | null;
}

interface RawSearchAnalyticsRow {
  keys?: string[] | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
}

interface RawSitemapContent {
  type?: string | null;
  submitted?: string | number | null;
  indexed?: string | number | null;
}

interface RawSitemapEntry {
  path?: string | null;
  lastSubmitted?: string | null;
  lastDownloaded?: string | null;
  warnings?: string | number | null;
  errors?: string | number | null;
  isPending?: boolean | null;
  isSitemapsIndex?: boolean | null;
  type?: string | null;
  contents?: RawSitemapContent[];
}

export interface RawSearchConsoleClient {
  sites?: {
    list: GoogleCall<{ siteEntry?: RawSiteEntry[] }>;
  };
  searchanalytics?: {
    query: GoogleCall<{ rows?: RawSearchAnalyticsRow[] }>;
  };
  sitemaps?: {
    list: GoogleCall<{ sitemap?: RawSitemapEntry[] }>;
  };
  urlInspection?: {
    index?: {
      inspect: GoogleCall<{
        inspectionResult?: {
          inspectionResultLink?: string | null;
          indexStatusResult?: InspectUrlOutput["indexStatus"];
          mobileUsabilityResult?: unknown;
          richResultsResult?: unknown;
          ampResult?: unknown;
        };
      }>;
    };
  };
}

function assertRawCollectionCardinality(
  collection: readonly unknown[] | undefined,
  maximum: number,
  label: string
): void {
  if (collection !== undefined && collection.length > maximum) {
    throw new BudgetLimitError(
      "budget_output_items_exceeded",
      `${label} exceeds the deterministic ${maximum}-item gateway limit`
    );
  }
}

function hasSiteUrl(site: RawSiteEntry): site is RawSiteEntry & { siteUrl: string } {
  return Boolean(site.siteUrl);
}

function hasSitemapPath(
  sitemap: RawSitemapEntry
): sitemap is RawSitemapEntry & { path: string } {
  return Boolean(sitemap.path);
}

function toSitemapContent(content: RawSitemapContent): SitemapContent {
  return {
    ...(content.type ? { type: content.type } : {}),
    ...(content.submitted !== undefined && content.submitted !== null
      ? { submitted: Number(content.submitted) }
      : {}),
    ...(content.indexed !== undefined && content.indexed !== null
      ? { indexed: Number(content.indexed) }
      : {})
  };
}

function toSitemapEntry(sitemap: RawSitemapEntry & { path: string }): SitemapEntry {
  return {
    path: sitemap.path ?? "",
    ...(sitemap.lastSubmitted ? { lastSubmitted: sitemap.lastSubmitted } : {}),
    ...(sitemap.lastDownloaded ? { lastDownloaded: sitemap.lastDownloaded } : {}),
    ...(sitemap.warnings !== undefined && sitemap.warnings !== null
      ? { warnings: Number(sitemap.warnings) }
      : {}),
    ...(sitemap.errors !== undefined && sitemap.errors !== null
      ? { errors: Number(sitemap.errors) }
      : {}),
    ...(sitemap.isPending !== undefined && sitemap.isPending !== null
      ? { isPending: sitemap.isPending }
      : {}),
    ...(sitemap.isSitemapsIndex !== undefined && sitemap.isSitemapsIndex !== null
      ? { isSitemapsIndex: sitemap.isSitemapsIndex }
      : {}),
    ...(sitemap.type ? { type: sitemap.type } : {}),
    ...(sitemap.contents ? { contents: sitemap.contents.map(toSitemapContent) } : {})
  };
}

export class GoogleSearchConsoleClient implements GscService {
  private readonly timeoutMs: number;

  constructor(
    private readonly rawClient: RawSearchConsoleClient,
    options: { readonly timeoutMs: number }
  ) {
    const timeoutMs = options.timeoutMs;
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > READ_ATTEMPT_TIMEOUT_MS
    ) {
      throw new BudgetLimitError(
        "budget_invalid_configuration",
        `Google attempt timeout must be an integer from 1 to ${READ_ATTEMPT_TIMEOUT_MS}ms`
      );
    }
    this.timeoutMs = timeoutMs;
  }

  async listSites(signal: AbortSignal): Promise<{ sites: SiteEntry[] }> {
    if (!this.rawClient.sites) throw new Error("Search Console sites client is unavailable");
    const response = await this.rawClient.sites.list({}, this.requestOptions(signal));
    assertRawCollectionCardinality(
      response.data.siteEntry,
      MAX_ALLOWLIST_ENTRIES,
      "Search Console site inventory"
    );
    return {
      sites: (response.data.siteEntry ?? [])
        .filter(hasSiteUrl)
        .map((site) => ({
          siteUrl: site.siteUrl ?? "",
          ...(site.permissionLevel ? { permissionLevel: site.permissionLevel } : {})
        }))
    };
  }

  async searchAnalytics(
    input: SearchAnalyticsInput,
    signal: AbortSignal
  ): Promise<SearchAnalyticsOutput> {
    if (!this.rawClient.searchanalytics) throw new Error("Search Console search analytics client is unavailable");
    const response = await this.rawClient.searchanalytics.query(
      {
        siteUrl: input.site_url,
        requestBody: toSearchAnalyticsRequest(input)
      },
      this.requestOptions(signal)
    );
    assertRawCollectionCardinality(
      response.data.rows,
      input.row_limit,
      "Search Analytics response"
    );
    return {
      rows: (response.data.rows ?? []).map(toSearchAnalyticsRow),
      note: "Results are sorted by clicks descending by the Search Console API and may not include every possible row."
    };
  }

  async listSitemaps(siteUrl: string, signal: AbortSignal): Promise<{ sitemaps: SitemapEntry[] }> {
    if (!this.rawClient.sitemaps) throw new Error("Search Console sitemaps client is unavailable");
    const response = await this.rawClient.sitemaps.list({ siteUrl }, this.requestOptions(signal));
    assertRawCollectionCardinality(
      response.data.sitemap,
      MAX_ANALYTICS_ROWS_PER_REQUEST,
      "Search Console sitemap inventory"
    );
    return {
      sitemaps: (response.data.sitemap ?? []).filter(hasSitemapPath).map(toSitemapEntry)
    };
  }

  async inspectUrl(input: InspectUrlInput, signal: AbortSignal): Promise<InspectUrlOutput> {
    const inspect = this.rawClient.urlInspection?.index?.inspect;
    if (!inspect) throw new Error("Search Console URL Inspection client is unavailable");
    const response = await inspect(
      {
        requestBody: {
          siteUrl: input.site_url,
          inspectionUrl: input.inspection_url,
          languageCode: input.language_code
        }
      },
      this.requestOptions(signal)
    );
    const result = response.data.inspectionResult ?? {};
    return {
      ...(result.inspectionResultLink ? { inspectionResultLink: result.inspectionResultLink } : {}),
      indexStatus: result.indexStatusResult ?? {},
      ...(result.mobileUsabilityResult ? { mobileUsability: result.mobileUsabilityResult } : {}),
      ...(result.richResultsResult ? { richResults: result.richResultsResult } : {}),
      ...(result.ampResult ? { amp: result.ampResult } : {})
    };
  }

  private requestOptions(signal: AbortSignal): GoogleRequestOptions {
    return { signal, timeout: this.timeoutMs };
  }
}

function toSearchAnalyticsRequest(input: SearchAnalyticsInput) {
  return {
    startDate: input.start_date,
    endDate: input.end_date,
    dimensions: input.dimensions,
    rowLimit: input.row_limit,
    startRow: input.start_row,
    ...(input.filters.length > 0
      ? {
          dimensionFilterGroups: input.filters.map((group) => ({
            groupType: group.group_type,
            filters: group.filters.map((filter) => ({
              dimension: filter.dimension,
              operator: filter.operator,
              expression: filter.expression
            }))
          }))
        }
      : {})
  };
}

function toSearchAnalyticsRow(row: RawSearchAnalyticsRow): SearchAnalyticsRow {
  return {
    keys: row.keys ?? [],
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0
  };
}
