import { describe, expect, it } from "vitest";
import {
  parseHttpTargetUrl,
  parseSearchConsoleProperty,
  validateSitemapTarget
} from "../../src/resources/index.js";

describe("dormant sitemap-target validation", () => {
  it.each([
    ["sc-domain:example.com", "https://example.com/sitemap.xml"],
    ["sc-domain:example.com", "https://www.example.com/sitemap.xml"],
    ["https://example.com/", "https://example.com/sitemap.xml"],
    ["https://example.com/docs/", "https://example.com/docs/sitemap.xml"]
  ])("accepts HTTPS sitemap %s under property %s", (propertyValue, targetValue) => {
    const property = parseSearchConsoleProperty(propertyValue);
    const target = validateSitemapTarget(property, targetValue);

    expect(target.apiValue).toBe(targetValue);
    expect(target.scheme).toBe("https");
  });

  it("returns an already parsed branded target unchanged", () => {
    const property = parseSearchConsoleProperty("https://example.com/");
    const target = parseHttpTargetUrl("https://example.com/sitemap.xml");

    expect(validateSitemapTarget(property, target)).toBe(target);
  });

  it("rejects cross-property and non-HTTP sitemap targets", () => {
    const property = parseSearchConsoleProperty("sc-domain:example.com");

    expect(() => validateSitemapTarget(property, "https://other.example/sitemap.xml")).toThrow(/not contained/);
    expect(() => validateSitemapTarget(property, "file:///tmp/sitemap.xml")).toThrow(/http/i);
    expect(() => validateSitemapTarget(property, "ftp://example.com/sitemap.xml")).toThrow(/http/i);
    expect(() => validateSitemapTarget(property, "data:text/plain,sitemap")).toThrow(/http/i);
  });

  it("requires a property-bound recorded exception for an HTTP sitemap", () => {
    const property = parseSearchConsoleProperty("http://example.com/docs/");
    const targetValue = "http://example.com/docs/sitemap.xml";

    expect(() => validateSitemapTarget(property, targetValue)).toThrow(/exception bound/);
    expect(() =>
      validateSitemapTarget(property, targetValue, {
        httpExceptionPropertyPolicyKey: "search-console-property:url-prefix:http://other.example/"
      })
    ).toThrow(/exception bound/);
    expect(
      validateSitemapTarget(property, targetValue, {
        httpExceptionPropertyPolicyKey: property.policyKey
      }).apiValue
    ).toBe(targetValue);
  });

  it("does not permit an HTTP exception for a domain or HTTPS property", () => {
    const domainProperty = parseSearchConsoleProperty("sc-domain:example.com");
    const httpsProperty = parseSearchConsoleProperty("https://example.com/");

    expect(() =>
      validateSitemapTarget(domainProperty, "http://example.com/sitemap.xml", {
        httpExceptionPropertyPolicyKey: domainProperty.policyKey
      })
    ).toThrow(/exception bound/);
    expect(() =>
      validateSitemapTarget(httpsProperty, "http://example.com/sitemap.xml", {
        httpExceptionPropertyPolicyKey: httpsProperty.policyKey
      })
    ).toThrow();
  });

  it("rejects structurally forged properties", () => {
    const property = parseSearchConsoleProperty("https://example.com/");

    expect(() =>
      validateSitemapTarget({ ...property }, "https://example.com/sitemap.xml")
    ).toThrow(/parser-created/);
  });
});
