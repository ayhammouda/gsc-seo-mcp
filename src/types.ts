import type { InspectUrlInput, SearchAnalyticsInput } from "./schemas.js";

export const READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const WRITE_SCOPE = "https://www.googleapis.com/auth/webmasters";

export type AuthMode = "stored" | "adc";
export type AccessMode = "read_only" | "operator";

export interface AppConfig {
  authMode: AuthMode;
  mode: AccessMode;
  allowedProperties: readonly string[];
  googleClientId?: string;
  googleClientSecret?: string;
  tokenStorePath: string;
  requestTimeoutMs: number;
  totalDeadlineMs: number;
}

export interface SiteEntry {
  siteUrl: string;
  permissionLevel?: string;
}

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsOutput {
  rows: SearchAnalyticsRow[];
  note: string;
}

export interface SitemapContent {
  type?: string;
  submitted?: number;
  indexed?: number;
}

export interface SitemapEntry {
  path: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  warnings?: number;
  errors?: number;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  type?: string;
  contents?: SitemapContent[];
}

export interface InspectUrlOutput {
  inspectionResultLink?: string;
  indexStatus: {
    verdict?: string;
    coverageState?: string;
    robotsTxtState?: string;
    indexingState?: string;
    pageFetchState?: string;
    googleCanonical?: string;
    userCanonical?: string;
    lastCrawlTime?: string;
    crawledAs?: string;
    sitemap?: string[];
    referringUrls?: string[];
  };
  mobileUsability?: unknown;
  richResults?: unknown;
  amp?: unknown;
}

export interface DecliningPage {
  page: string;
  current: SearchAnalyticsRow;
  previous: SearchAnalyticsRow;
  deltas: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
  explanation: string;
}

export interface KeywordOpportunity {
  query: string;
  page?: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  opportunityReason: string;
}

export interface GscService {
  listSites(signal: AbortSignal): Promise<{ sites: SiteEntry[] }>;
  searchAnalytics(input: SearchAnalyticsInput, signal: AbortSignal): Promise<SearchAnalyticsOutput>;
  listSitemaps(siteUrl: string, signal: AbortSignal): Promise<{ sitemaps: SitemapEntry[] }>;
  inspectUrl(input: InspectUrlInput, signal: AbortSignal): Promise<InspectUrlOutput>;
}

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
