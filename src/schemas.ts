import * as z from "zod/v4";
import {
  MAX_ANALYTICS_ROWS_PER_REQUEST,
  MAX_ANALYTICS_WINDOW_ROWS,
  MAX_FILTER_GROUPS,
  MAX_FILTERS_PER_GROUP,
  MAX_LANGUAGE_CODE_LENGTH,
  MAX_PROPERTY_OR_URL_BYTES
} from "./kernel/budget-limits.js";
import {
  parseCalendarDate,
  parseCalendarDateRange,
  parseHttpTargetUrl,
  parseSearchConsoleProperty,
  isWellFormedBcp47LanguageTag,
  requireTargetUnderProperty
} from "./resources/index.js";
import type { DecliningPage, InspectUrlOutput, KeywordOpportunity } from "./types.js";

export const dimensionSchema = z.enum(["query", "page", "country", "device", "date", "searchAppearance"]);
export const filterOperatorSchema = z.enum([
  "contains",
  "equals",
  "notContains",
  "notEquals",
  "includingRegex",
  "excludingRegex"
]);

const textEncoder = new TextEncoder();

function succeeds(operation: () => unknown): boolean {
  try {
    operation();
    return true;
  } catch {
    return false;
  }
}

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((value) => succeeds(() => parseCalendarDate(value)), "Date must be a valid calendar day");

const siteUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => textEncoder.encode(value).byteLength <= MAX_PROPERTY_OR_URL_BYTES,
    `site_url must not exceed ${MAX_PROPERTY_OR_URL_BYTES} UTF-8 bytes`
  )
  .refine((value) => succeeds(() => parseSearchConsoleProperty(value)), {
    message: "site_url must be an exact Search Console URL-prefix or sc-domain property"
  });

const httpTargetUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => textEncoder.encode(value).byteLength <= MAX_PROPERTY_OR_URL_BYTES,
    `URL must not exceed ${MAX_PROPERTY_OR_URL_BYTES} UTF-8 bytes`
  )
  .refine((value) => succeeds(() => parseHttpTargetUrl(value)), {
    message: "URL must be an unambiguous absolute HTTP(S) URL without credentials or a fragment"
  });

const languageCodeSchema = z
  .string()
  .min(2)
  .max(MAX_LANGUAGE_CODE_LENGTH)
  .refine((value) => isWellFormedBcp47LanguageTag(value), {
    message: "language_code must be a valid BCP-47 language tag"
  });

const uniqueDimensions = (dimensions: string[]) => new Set(dimensions).size === dimensions.length;

function isCalendarRangeWithin(startDate: string, endDate: string, maxInclusiveDays: number): boolean {
  return succeeds(() => parseCalendarDateRange(startDate, endDate, { maxInclusiveDays }));
}

export const emptyInputSchema = z.strictObject({});

export const dimensionFilterSchema = z.strictObject({
  dimension: dimensionSchema.exclude(["date"]),
  operator: filterOperatorSchema.default("equals"),
  expression: z.string().min(1).max(4096)
});

export const dimensionFilterGroupSchema = z.strictObject({
  group_type: z.enum(["and"]).default("and"),
  filters: z.array(dimensionFilterSchema).min(1).max(MAX_FILTERS_PER_GROUP)
});

export const searchAnalyticsInputSchema = z
  .strictObject({
    site_url: siteUrlSchema,
    start_date: isoDateSchema,
    end_date: isoDateSchema,
    dimensions: z
      .array(dimensionSchema)
      .max(dimensionSchema.options.length)
      .refine(uniqueDimensions, "Dimensions cannot be duplicated")
      .default([]),
    row_limit: z.int().min(1).max(MAX_ANALYTICS_ROWS_PER_REQUEST).default(MAX_ANALYTICS_ROWS_PER_REQUEST),
    start_row: z.int().min(0).max(MAX_ANALYTICS_WINDOW_ROWS - 1).default(0),
    filters: z.array(dimensionFilterGroupSchema).max(MAX_FILTER_GROUPS).default([])
  })
  .refine((input) => isCalendarRangeWithin(input.start_date, input.end_date, 90), {
    message: "Search Analytics requires an ordered range of at most 90 inclusive calendar days",
    path: ["end_date"]
  })
  .refine((input) => input.start_row + input.row_limit <= MAX_ANALYTICS_WINDOW_ROWS, {
    message: `Search Analytics pagination window must not exceed ${MAX_ANALYTICS_WINDOW_ROWS} rows`,
    path: ["start_row"]
  });

export const listSitemapsInputSchema = z.strictObject({
  site_url: siteUrlSchema
});

function isInspectionUnderSite(siteUrl: string, inspectionUrl: string): boolean {
  return succeeds(() => {
    const property = parseSearchConsoleProperty(siteUrl);
    const target = parseHttpTargetUrl(inspectionUrl);
    requireTargetUnderProperty(property, target);
  });
}

export const inspectUrlInputSchema = z
  .strictObject({
    site_url: siteUrlSchema,
    inspection_url: httpTargetUrlSchema,
    language_code: languageCodeSchema.default("en-US")
  })
  .refine((input) => isInspectionUnderSite(input.site_url, input.inspection_url), {
    message: "inspection_url must be under site_url",
    path: ["inspection_url"]
  });

export const findDecliningPagesInputSchema = z
  .strictObject({
    site_url: siteUrlSchema,
    current_start_date: isoDateSchema,
    current_end_date: isoDateSchema,
    previous_start_date: isoDateSchema,
    previous_end_date: isoDateSchema,
    min_impressions: z.int().min(0).default(100),
    limit: z.int().min(1).max(100).default(25)
  })
  .refine(
    (input) => isCalendarRangeWithin(input.current_start_date, input.current_end_date, 90),
    {
      message: "current range must be ordered and no longer than 90 inclusive calendar days",
      path: ["current_end_date"]
    }
  )
  .refine(
    (input) => isCalendarRangeWithin(input.previous_start_date, input.previous_end_date, 90),
    {
      message: "previous range must be ordered and no longer than 90 inclusive calendar days",
      path: ["previous_end_date"]
    }
  );

export const findKeywordOpportunitiesInputSchema = z
  .strictObject({
    site_url: siteUrlSchema,
    start_date: isoDateSchema,
    end_date: isoDateSchema,
    min_impressions: z.int().min(0).default(1000),
    max_ctr: z.number().min(0).max(1).default(0.05),
    position_min: z.number().min(1).default(4),
    position_max: z.number().min(1).default(20),
    limit: z.int().min(1).max(100).default(25)
  })
  .refine((input) => isCalendarRangeWithin(input.start_date, input.end_date, 90), {
    message: "date range must be ordered and no longer than 90 inclusive calendar days",
    path: ["end_date"]
  })
  .refine((input) => input.position_min <= input.position_max, {
    message: "position_min must be less than or equal to position_max",
    path: ["position_max"]
  });

export const searchRowSchema = z.object({
  keys: z.array(z.string()),
  clicks: z.number(),
  impressions: z.number(),
  ctr: z.number(),
  position: z.number()
});

export const listSitesOutputSchema = z.object({
  sites: z.array(
    z.object({
      siteUrl: z.string(),
      permissionLevel: z.string().optional()
    })
  )
});

export const searchAnalyticsOutputSchema = z.object({
  rows: z.array(searchRowSchema),
  note: z.string()
});

export const listSitemapsOutputSchema = z.object({
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

export const inspectUrlOutputSchema: z.ZodType<InspectUrlOutput> = z.object({
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

export const decliningPageSchema: z.ZodType<DecliningPage> = z.object({
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

export const keywordOpportunitySchema: z.ZodType<KeywordOpportunity> = z.object({
  query: z.string(),
  page: z.string().optional(),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  position: z.number(),
  opportunityReason: z.string()
});

export const decliningPagesOutputSchema = z.object({ pages: z.array(decliningPageSchema) });
export const keywordOpportunitiesOutputSchema = z.object({ opportunities: z.array(keywordOpportunitySchema) });

export type SearchAnalyticsInput = z.infer<typeof searchAnalyticsInputSchema>;
export type ListSitemapsInput = z.infer<typeof listSitemapsInputSchema>;
export type InspectUrlInput = z.infer<typeof inspectUrlInputSchema>;
export type FindDecliningPagesInput = z.infer<typeof findDecliningPagesInputSchema>;
export type FindKeywordOpportunitiesInput = z.infer<typeof findKeywordOpportunitiesInputSchema>;
