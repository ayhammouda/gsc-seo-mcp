import { describe, expect, it } from "vitest";
import {
  isSearchConsoleProperty,
  isTargetUnderProperty,
  parseHttpTargetUrl,
  parseSearchConsoleProperty,
  parseSearchConsolePropertyAllowlist,
  requireTargetUnderProperty,
  SEARCH_CONSOLE_PROPERTY_ALLOWLIST_MAX_ENTRIES
} from "../../src/resources/index.js";

describe("SearchConsoleProperty", () => {
  it("preserves Unicode domain API input and derives an IDNA policy key", () => {
    const apiValue = "sc-domain:BÜCHER.Example";
    const property = parseSearchConsoleProperty(apiValue);

    expect(property).toEqual({
      apiValue,
      kind: "domain",
      hostname: "xn--bcher-kva.example",
      policyKey: "search-console-property:domain:xn--bcher-kva.example"
    });
    expect(Object.isFrozen(property)).toBe(true);
    expect(isSearchConsoleProperty(property)).toBe(true);
    expect(parseSearchConsoleProperty(property)).toBe(property);
  });

  it("preserves URL-prefix API input and normalizes default port, host, and path policy data", () => {
    const apiValue = "HTTPS://Example.COM:443/docs/%7euser/";
    const property = parseSearchConsoleProperty(apiValue);

    expect(property).toMatchObject({
      apiValue,
      kind: "url-prefix",
      hostname: "example.com",
      origin: "https://example.com",
      pathname: "/docs/~user/",
      policyKey: "search-console-property:url-prefix:https://example.com/docs/~user/"
    });
    expect(property.kind === "url-prefix" && property.target.apiValue).toBe(apiValue);
  });

  it.each([
    "sc-domain:",
    "sc-domain: ",
    "SC-DOMAIN:example.com",
    "sc-domain:https://example.com",
    "sc-domain:example.com/path",
    "sc-domain:example.com:443",
    "sc-domain:user@example.com",
    "sc-domain:.example.com",
    "sc-domain:example.com.",
    "sc-domain:bad_label.example",
    "sc-domain:-bad.example",
    "sc-domain:bad-.example",
    "sc-domain:127.0.0.1",
    "sc-domain:[::1]"
  ])("rejects invalid domain property %s", (value) => {
    expect(() => parseSearchConsoleProperty(value)).toThrow();
  });

  it.each([
    "https://example.com/?query=1",
    "https://example.com/?",
    "https://example.com/#fragment",
    "https://example.com",
    "https://example.com/docs",
    "ftp://example.com/",
    "file:///tmp/site"
  ])("rejects invalid URL-prefix property %s", (value) => {
    expect(() => parseSearchConsoleProperty(value)).toThrow();
  });

  it("rejects structurally forged property values", () => {
    const forged = Object.freeze({
      apiValue: "sc-domain:example.com",
      kind: "domain",
      hostname: "example.com",
      policyKey: "search-console-property:domain:example.com"
    });

    expect(isSearchConsoleProperty(forged)).toBe(false);
    expect(() => parseSearchConsoleProperty(forged)).toThrow();
  });
});

describe("property containment", () => {
  it.each([
    ["sc-domain:example.com", "https://example.com/", true],
    ["sc-domain:example.com", "http://docs.example.com/page", true],
    ["sc-domain:example.com", "https://deep.docs.example.com/page", true],
    ["sc-domain:example.com", "https://example.com.evil.test/page", false],
    ["sc-domain:example.com", "https://notexample.com/page", false],
    ["sc-domain:bücher.example", "https://xn--bcher-kva.example/page", true]
  ])("applies exact domain/subdomain containment for %s and %s", (propertyValue, targetValue, expected) => {
    const property = parseSearchConsoleProperty(propertyValue);
    const target = parseHttpTargetUrl(targetValue);

    expect(isTargetUnderProperty(property, target)).toBe(expected);
  });

  it.each([
    ["https://example.com/", "https://example.com/anything", true],
    ["https://example.com/docs/", "https://example.com/docs/", true],
    ["https://example.com/docs/", "https://example.com/docs/page", true],
    ["https://example.com/docs/", "https://example.com/docs", false],
    ["https://example.com/docs/", "https://example.com/docs2", false],
    ["https://example.com/docs/", "http://example.com/docs/", false],
    ["https://example.com/docs/", "https://sub.example.com/docs/", false],
    ["https://example.com:443/docs/", "https://example.com/docs/page", true],
    ["https://example.com:8443/docs/", "https://example.com/docs/page", false],
    ["https://example.com/%61/", "https://example.com/a/b", true]
  ])("applies parsed origin/path-segment containment for %s and %s", (propertyValue, targetValue, expected) => {
    const property = parseSearchConsoleProperty(propertyValue);
    const target = parseHttpTargetUrl(targetValue);

    expect(isTargetUnderProperty(property, target)).toBe(expected);
    if (expected) {
      expect(requireTargetUnderProperty(property, target)).toBe(target);
    } else {
      expect(() => requireTargetUnderProperty(property, target)).toThrow(/not contained/);
    }
  });

  it("fails forged values closed", () => {
    const property = parseSearchConsoleProperty("sc-domain:example.com");
    const target = parseHttpTargetUrl("https://example.com/");
    const forgedProperty = { ...property };
    const forgedTarget = { ...target };

    expect(isTargetUnderProperty(forgedProperty, target)).toBe(false);
    expect(isTargetUnderProperty(property, forgedTarget)).toBe(false);
    expect(() => requireTargetUnderProperty(forgedProperty, target)).toThrow(/parser-created/);
    expect(() => requireTargetUnderProperty(property, forgedTarget)).toThrow(/parser-created/);
  });
});

describe("Search Console property allowlist", () => {
  it("returns a frozen array of branded properties", () => {
    const allowlist = parseSearchConsolePropertyAllowlist([
      "sc-domain:example.com",
      "https://example.com/docs/"
    ]);

    expect(Object.isFrozen(allowlist)).toBe(true);
    expect(allowlist.every(isSearchConsoleProperty)).toBe(true);
  });

  it.each([
    ["domain case", ["sc-domain:Example.com", "sc-domain:example.com"]],
    ["IDNA", ["sc-domain:bücher.example", "sc-domain:xn--bcher-kva.example"]],
    ["default port", ["https://example.com:443/", "https://example.com/"]],
    ["URL host case", ["https://EXAMPLE.com/", "https://example.com/"]],
    ["percent encoding", ["https://example.com/%61/", "https://example.com/a/"]],
    ["exact duplicate", ["sc-domain:example.com", "sc-domain:example.com"]]
  ])("rejects normalized %s collisions", (_label, values) => {
    expect(() => parseSearchConsolePropertyAllowlist(values)).toThrow(/normalized collision/);
  });

  it.each([[], "sc-domain:example.com", null, [42]])("rejects malformed allowlist %j", (value) => {
    expect(() => parseSearchConsolePropertyAllowlist(value)).toThrow();
  });

  it("accepts exactly 1,000 unique properties and rejects one entry over before parsing", () => {
    const exact = Array.from(
      { length: SEARCH_CONSOLE_PROPERTY_ALLOWLIST_MAX_ENTRIES },
      (_, index) => `sc-domain:p${index}.example.com`
    );

    expect(parseSearchConsolePropertyAllowlist(exact)).toHaveLength(
      SEARCH_CONSOLE_PROPERTY_ALLOWLIST_MAX_ENTRIES
    );
    expect(() =>
      parseSearchConsolePropertyAllowlist([
        ...exact,
        "this over-limit entry is rejected before semantic parsing"
      ])
    ).toThrow(/1000 entries/);
  });
});
