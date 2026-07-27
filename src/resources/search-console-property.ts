import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import {
  isHttpTargetUrl,
  parseHttpTargetUrl
} from "./http-target-url.js";
import type { HttpTargetUrl } from "./http-target-url.js";
import {
  SEARCH_CONSOLE_PROPERTY_ALLOWLIST_MAX_ENTRIES,
  assertResourceIdentifierByteLength
} from "./limits.js";

const DOMAIN_PREFIX = "sc-domain:";
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const properties = new WeakSet<object>();

export interface DomainSearchConsoleProperty {
  readonly apiValue: string;
  readonly kind: "domain";
  readonly policyKey: string;
  readonly hostname: string;
}

export interface UrlPrefixSearchConsoleProperty {
  readonly apiValue: string;
  readonly kind: "url-prefix";
  readonly policyKey: string;
  readonly hostname: string;
  readonly origin: string;
  readonly pathname: string;
  readonly target: HttpTargetUrl;
}

export type SearchConsoleProperty =
  | DomainSearchConsoleProperty
  | UrlPrefixSearchConsoleProperty;

function normalizeDomainProperty(value: string): string {
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    );
  });
  if (
    value.length === 0 ||
    value !== value.trim() ||
    hasControlCharacter ||
    /\s/u.test(value)
  ) {
    throw new Error("Search Console domain property must contain a non-empty DNS name");
  }
  if (
    value.includes("://") ||
    /[/\\:@?#]/.test(value) ||
    value.startsWith(".") ||
    value.endsWith(".")
  ) {
    throw new Error("Search Console domain property must be a DNS name without scheme, port, path, or credentials");
  }

  const ascii = domainToASCII(value).toLowerCase();
  if (ascii.length === 0 || ascii.length > 253 || isIP(ascii) !== 0) {
    throw new Error("Search Console domain property must be a valid DNS name");
  }
  const labels = ascii.split(".");
  if (labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))) {
    throw new Error("Search Console domain property contains an invalid DNS label");
  }
  return ascii;
}

function createDomainProperty(apiValue: string, domainValue: string): SearchConsoleProperty {
  const hostname = normalizeDomainProperty(domainValue);
  const property: DomainSearchConsoleProperty = Object.freeze({
    apiValue,
    kind: "domain",
    policyKey: `search-console-property:domain:${hostname}`,
    hostname
  });
  properties.add(property);
  return property;
}

function createUrlPrefixProperty(apiValue: string): SearchConsoleProperty {
  const target = parseHttpTargetUrl(apiValue);
  if (target.search.length > 0 || apiValue.includes("?")) {
    throw new Error("Search Console URL-prefix property must not contain a query");
  }
  if (!apiValue.endsWith("/")) {
    throw new Error("Search Console URL-prefix property must include its trailing slash");
  }
  const property: UrlPrefixSearchConsoleProperty = Object.freeze({
    apiValue,
    kind: "url-prefix",
    policyKey: `search-console-property:url-prefix:${target.origin}${target.pathname}`,
    hostname: target.hostname,
    origin: target.origin,
    pathname: target.pathname,
    target
  });
  properties.add(property);
  return property;
}

function pathIsUnderPrefix(prefix: string, target: string): boolean {
  if (prefix === "/") return target.startsWith("/");
  if (target === prefix) return true;
  return prefix.endsWith("/") ? target.startsWith(prefix) : target.startsWith(`${prefix}/`);
}

export function isSearchConsoleProperty(value: unknown): value is SearchConsoleProperty {
  return typeof value === "object" && value !== null && properties.has(value);
}

export function parseSearchConsoleProperty(value: unknown): SearchConsoleProperty {
  if (isSearchConsoleProperty(value)) return value;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Search Console property must be a non-empty string");
  }
  assertResourceIdentifierByteLength(value, "Search Console property");
  if (value.startsWith(DOMAIN_PREFIX)) {
    return createDomainProperty(value, value.slice(DOMAIN_PREFIX.length));
  }
  if (/^sc-domain:/i.test(value)) {
    throw new Error("Search Console domain property prefix must be exactly sc-domain:");
  }
  return createUrlPrefixProperty(value);
}

export function isTargetUnderProperty(
  property: SearchConsoleProperty,
  target: HttpTargetUrl
): boolean {
  if (!isSearchConsoleProperty(property) || !isHttpTargetUrl(target)) return false;
  if (property.kind === "domain") {
    return (
      target.hostname === property.hostname ||
      target.hostname.endsWith(`.${property.hostname}`)
    );
  }
  return property.origin === target.origin && pathIsUnderPrefix(property.pathname, target.pathname);
}

export function requireTargetUnderProperty(
  property: SearchConsoleProperty,
  target: HttpTargetUrl
): HttpTargetUrl {
  if (!isSearchConsoleProperty(property)) {
    throw new Error("A parser-created Search Console property is required");
  }
  if (!isHttpTargetUrl(target)) {
    throw new Error("A parser-created HTTP target URL is required");
  }
  if (!isTargetUnderProperty(property, target)) {
    throw new Error("HTTP target URL is not contained by the Search Console property");
  }
  return target;
}

export function parseSearchConsolePropertyAllowlist(value: unknown): readonly SearchConsoleProperty[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Search Console property allowlist must be a non-empty array");
  }
  if (value.length > SEARCH_CONSOLE_PROPERTY_ALLOWLIST_MAX_ENTRIES) {
    throw new Error(
      `Search Console property allowlist must not exceed ${SEARCH_CONSOLE_PROPERTY_ALLOWLIST_MAX_ENTRIES} entries`
    );
  }

  const parsed: SearchConsoleProperty[] = [];
  const policyKeys = new Map<string, string>();
  for (const entry of value) {
    const property = parseSearchConsoleProperty(entry);
    const priorApiValue = policyKeys.get(property.policyKey);
    if (priorApiValue !== undefined) {
      throw new Error(
        `Search Console property allowlist contains a normalized collision between ${priorApiValue} and ${property.apiValue}`
      );
    }
    policyKeys.set(property.policyKey, property.apiValue);
    parsed.push(property);
  }
  return Object.freeze(parsed);
}
