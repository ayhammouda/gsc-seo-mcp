import type {
  GscService,
  InspectUrlOutput,
  SearchAnalyticsOutput,
  SearchAnalyticsRow,
  SiteEntry,
  SitemapEntry
} from "./types.js";
import { searchAnalyticsInputSchema, inspectUrlInputSchema, type SearchAnalyticsInput } from "./schemas.js";

interface GoogleRequestOptions {
  signal: AbortSignal;
  timeout: number;
}

interface GoogleResponse<T> {
  data: T;
}

type GoogleCall<T> = (params: unknown, options: GoogleRequestOptions) => Promise<GoogleResponse<T>>;

export interface RawSearchConsoleClient {
  sites?: {
    list: GoogleCall<{ siteEntry?: Array<{ siteUrl?: string | null; permissionLevel?: string | null }> }>;
  };
  searchanalytics?: {
    query: GoogleCall<{
      rows?: Array<{
        keys?: string[] | null;
        clicks?: number | null;
        impressions?: number | null;
        ctr?: number | null;
        position?: number | null;
      }>;
    }>;
  };
  sitemaps?: {
    list: GoogleCall<{
      sitemap?: Array<{
        path?: string | null;
        lastSubmitted?: string | null;
        lastDownloaded?: string | null;
        warnings?: string | number | null;
        errors?: string | number | null;
        isPending?: boolean | null;
        isSitemapsIndex?: boolean | null;
        type?: string | null;
        contents?: Array<{ type?: string | null; submitted?: string | number | null; indexed?: string | number | null }>;
      }>;
    }>;
    submit: GoogleCall<void>;
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

export class GoogleSearchConsoleClient implements GscService {
  constructor(
    private readonly rawClient: RawSearchConsoleClient,
    private readonly options: { timeoutMs: number }
  ) {}

  async listSites(signal: AbortSignal): Promise<{ sites: SiteEntry[] }> {
    if (!this.rawClient.sites) throw new Error("Search Console sites client is unavailable");
    const response = await this.rawClient.sites.list({}, this.requestOptions(signal));
    return {
      sites: (response.data.siteEntry ?? [])
        .filter((site) => Boolean(site.siteUrl))
        .map((site) => ({
          siteUrl: site.siteUrl ?? "",
          ...(site.permissionLevel ? { permissionLevel: site.permissionLevel } : {})
        }))
    };
  }

  async searchAnalytics(input: unknown, signal: AbortSignal): Promise<SearchAnalyticsOutput> {
    if (!this.rawClient.searchanalytics) throw new Error("Search Console search analytics client is unavailable");
    const parsed = searchAnalyticsInputSchema.parse(input);
    const response = await this.rawClient.searchanalytics.query(
      {
        siteUrl: parsed.site_url,
        requestBody: toSearchAnalyticsRequest(parsed)
      },
      this.requestOptions(signal)
    );
    return {
      rows: (response.data.rows ?? []).map(toSearchAnalyticsRow),
      note: "Results are sorted by clicks descending by the Search Console API and may not include every possible row."
    };
  }

  async listSitemaps(siteUrl: string, signal: AbortSignal): Promise<{ sitemaps: SitemapEntry[] }> {
    if (!this.rawClient.sitemaps) throw new Error("Search Console sitemaps client is unavailable");
    const response = await this.rawClient.sitemaps.list({ siteUrl }, this.requestOptions(signal));
    return {
      sitemaps: (response.data.sitemap ?? [])
        .filter((sitemap) => Boolean(sitemap.path))
        .map((sitemap) => ({
          path: sitemap.path ?? "",
          ...(sitemap.lastSubmitted ? { lastSubmitted: sitemap.lastSubmitted } : {}),
          ...(sitemap.lastDownloaded ? { lastDownloaded: sitemap.lastDownloaded } : {}),
          ...(sitemap.warnings !== undefined && sitemap.warnings !== null
            ? { warnings: Number(sitemap.warnings) }
            : {}),
          ...(sitemap.errors !== undefined && sitemap.errors !== null ? { errors: Number(sitemap.errors) } : {}),
          ...(sitemap.isPending !== undefined && sitemap.isPending !== null ? { isPending: sitemap.isPending } : {}),
          ...(sitemap.isSitemapsIndex !== undefined && sitemap.isSitemapsIndex !== null
            ? { isSitemapsIndex: sitemap.isSitemapsIndex }
            : {}),
          ...(sitemap.type ? { type: sitemap.type } : {}),
          ...(sitemap.contents
            ? {
                contents: sitemap.contents.map((content) => ({
                  ...(content.type ? { type: content.type } : {}),
                  ...(content.submitted !== undefined && content.submitted !== null
                    ? { submitted: Number(content.submitted) }
                    : {}),
                  ...(content.indexed !== undefined && content.indexed !== null ? { indexed: Number(content.indexed) } : {})
                }))
              }
            : {})
        }))
    };
  }

  async submitSitemap(siteUrl: string, sitemapUrl: string, signal: AbortSignal): Promise<void> {
    if (!this.rawClient.sitemaps) throw new Error("Search Console sitemaps client is unavailable");
    await this.rawClient.sitemaps.submit({ siteUrl, feedpath: sitemapUrl }, this.requestOptions(signal));
  }

  async inspectUrl(input: unknown, signal: AbortSignal): Promise<InspectUrlOutput> {
    const inspect = this.rawClient.urlInspection?.index?.inspect;
    if (!inspect) throw new Error("Search Console URL Inspection client is unavailable");
    const parsed = inspectUrlInputSchema.parse(input);
    const response = await inspect(
      {
        requestBody: {
          siteUrl: parsed.site_url,
          inspectionUrl: parsed.inspection_url,
          languageCode: parsed.language_code
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
    return { signal, timeout: this.options.timeoutMs };
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

function toSearchAnalyticsRow(row: {
  keys?: string[] | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
}): SearchAnalyticsRow {
  return {
    keys: row.keys ?? [],
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0
  };
}

