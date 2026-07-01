import * as z from "zod/v4";

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

export type SearchAnalyticsInput = z.infer<typeof searchAnalyticsInputSchema>;
export type InspectUrlInput = z.infer<typeof inspectUrlInputSchema>;
export type FindDecliningPagesInput = z.infer<typeof findDecliningPagesInputSchema>;
export type FindKeywordOpportunitiesInput = z.infer<typeof findKeywordOpportunitiesInputSchema>;

