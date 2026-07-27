import {
  isHttpTargetUrl,
  parseHttpTargetUrl
} from "./http-target-url.js";
import type { HttpTargetUrl } from "./http-target-url.js";
import {
  isSearchConsoleProperty,
  requireTargetUnderProperty
} from "./search-console-property.js";
import type { SearchConsoleProperty } from "./search-console-property.js";

export interface SitemapTargetValidationOptions {
  readonly httpExceptionPropertyPolicyKey?: string;
}

export function validateSitemapTarget(
  property: SearchConsoleProperty,
  targetValue: unknown,
  options: SitemapTargetValidationOptions = {}
): HttpTargetUrl {
  if (!isSearchConsoleProperty(property)) {
    throw new Error("A parser-created Search Console property is required for sitemap validation");
  }
  const target = isHttpTargetUrl(targetValue) ? targetValue : parseHttpTargetUrl(targetValue);
  requireTargetUnderProperty(property, target);

  if (target.scheme === "http") {
    const approvedPolicyKey = options.httpExceptionPropertyPolicyKey;
    if (
      property.kind !== "url-prefix" ||
      property.target.scheme !== "http" ||
      approvedPolicyKey !== property.policyKey
    ) {
      throw new Error(
        "HTTP sitemap targets require an exception bound to the exact HTTP URL-prefix property policy key"
      );
    }
  }

  return target;
}
