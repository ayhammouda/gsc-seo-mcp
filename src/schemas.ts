import * as z from "zod/v4";
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

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Date must be valid");

const siteUrlSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith("sc-domain:") || z.url().safeParse(value).success, {
    message: "site_url must be a URL-prefix property URL or sc-domain property"
  });

const uniqueDimensions = (dimensions: string[]) => new Set(dimensions).size === dimensions.length;

export const emptyInputSchema = z.object({});

export const dimensionFilterSchema = z.object({
  dimension: dimensionSchema.exclude(["date"]),
  operator: filterOperatorSchema.default("equals"),
  expression: z.string().min(1).max(4096)
});

export const dimensionFilterGroupSchema = z.object({
  group_type: z.enum(["and"]).default("and"),
  filters: z.array(dimensionFilterSchema).min(1)
});

export const searchAnalyticsInputSchema = z
  .object({
    site_url: siteUrlSchema,
    start_date: isoDateSchema,
    end_date: isoDateSchema,
    dimensions: z.array(dimensionSchema).refine(uniqueDimensions, "Dimensions cannot be duplicated").default([]),
    row_limit: z.int().min(1).max(25_000).default(1000),
    start_row: z.int().min(0).default(0),
    filters: z.array(dimensionFilterGroupSchema).default([])
  })
  .refine((input) => input.start_date <= input.end_date, {
    message: "start_date must be less than or equal to end_date",
    path: ["start_date"]
  });

export const listSitemapsInputSchema = z.object({
  site_url: siteUrlSchema
});

export const submitSitemapInputSchema = z.object({
  site_url: siteUrlSchema,
  sitemap_url: z.url()
});

function isInspectionUnderSite(siteUrl: string, inspectionUrl: string): boolean {
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    const hostname = new URL(inspectionUrl).hostname.toLowerCase();
    return hostname === domain || hostname.endsWith(`.${domain}`);
  }
  return inspectionUrl.startsWith(siteUrl);
}

export const inspectUrlInputSchema = z
  .object({
    site_url: siteUrlSchema,
    inspection_url: z.url(),
    language_code: z.string().min(2).default("en-US")
  })
  .refine((input) => isInspectionUnderSite(input.site_url, input.inspection_url), {
    message: "inspection_url must be under site_url",
    path: ["inspection_url"]
  });

export const findDecliningPagesInputSchema = z
  .object({
    site_url: siteUrlSchema,
    current_start_date: isoDateSchema,
    current_end_date: isoDateSchema,
    previous_start_date: isoDateSchema,
    previous_end_date: isoDateSchema,
    min_impressions: z.int().min(0).default(100),
    limit: z.int().min(1).max(100).default(25)
  })
  .refine((input) => input.current_start_date <= input.current_end_date, {
    message: "current_start_date must be less than or equal to current_end_date",
    path: ["current_start_date"]
  })
  .refine((input) => input.previous_start_date <= input.previous_end_date, {
    message: "previous_start_date must be less than or equal to previous_end_date",
    path: ["previous_start_date"]
  });

export const findKeywordOpportunitiesInputSchema = z.object({
  site_url: siteUrlSchema,
  start_date: isoDateSchema,
  end_date: isoDateSchema,
  min_impressions: z.int().min(0).default(1000),
  max_ctr: z.number().min(0).max(1).default(0.05),
  position_min: z.number().min(1).default(4),
  position_max: z.number().min(1).default(20),
  limit: z.int().min(1).max(100).default(25)
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

export const submitSitemapOutputSchema = z.object({
  submitted: z.boolean(),
  siteUrl: z.string(),
  sitemapUrl: z.string()
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

export const toolSchemaContracts = {
  gsc_list_sites: { input: emptyInputSchema, output: listSitesOutputSchema },
  gsc_search_analytics: { input: searchAnalyticsInputSchema, output: searchAnalyticsOutputSchema },
  gsc_list_sitemaps: { input: listSitemapsInputSchema, output: listSitemapsOutputSchema },
  gsc_submit_sitemap: { input: submitSitemapInputSchema, output: submitSitemapOutputSchema },
  gsc_inspect_url: { input: inspectUrlInputSchema, output: inspectUrlOutputSchema },
  gsc_find_declining_pages: { input: findDecliningPagesInputSchema, output: decliningPagesOutputSchema },
  gsc_find_keyword_opportunities: { input: findKeywordOpportunitiesInputSchema, output: keywordOpportunitiesOutputSchema }
} as const;

export type SearchAnalyticsInput = z.infer<typeof searchAnalyticsInputSchema>;
export type InspectUrlInput = z.infer<typeof inspectUrlInputSchema>;
export type FindDecliningPagesInput = z.infer<typeof findDecliningPagesInputSchema>;
export type FindKeywordOpportunitiesInput = z.infer<typeof findKeywordOpportunitiesInputSchema>;
