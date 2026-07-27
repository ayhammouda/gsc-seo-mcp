import { domainToASCII } from "node:url";
import { assertResourceIdentifierByteLength } from "./limits.js";

const WHITESPACE_PATTERN = /\s/u;
const INVALID_PERCENT_ESCAPE_PATTERN = /%(?![0-9a-f]{2})/i;
const PERCENT_ESCAPE_PATTERN = /%[0-9a-f]{2}/i;
const ENCODED_SEPARATOR_PATTERN = /%(?:25)*(?:2f|5c)/i;
const ENCODED_DOT_TOKEN_PATTERN = /%(?:25)*2e/gi;
const UNRESERVED_CHARACTER_PATTERN = /^[a-z0-9\-._~]$/i;
const httpTargets = new WeakSet<object>();

export interface HttpTargetUrl {
  readonly apiValue: string;
  readonly scheme: "http" | "https";
  readonly hostname: string;
  readonly port: number | null;
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
  readonly policyKey: string;
}

function authorityFrom(value: string): string {
  const schemeSeparator = value.indexOf("://");
  if (schemeSeparator < 0) return "";
  const authorityStart = schemeSeparator + 3;
  const suffix = value.slice(authorityStart);
  const authorityEndOffset = suffix.search(/[/?#]/);
  return authorityEndOffset < 0 ? suffix : suffix.slice(0, authorityEndOffset);
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      return true;
    }
  }
  return false;
}

function rejectEncodedControlCharacters(value: string): void {
  let decoded = value;
  for (let depth = 0; depth < 16; depth += 1) {
    if (!PERCENT_ESCAPE_PATTERN.test(decoded)) return;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      throw new Error(
        "HTTP target URL contains invalid UTF-8 percent encoding"
      );
    }
    if (hasControlCharacter(decoded)) {
      throw new Error(
        "HTTP target URL must not contain encoded control characters"
      );
    }
  }
  if (PERCENT_ESCAPE_PATTERN.test(decoded)) {
    throw new Error("HTTP target URL percent encoding is excessively nested");
  }
}

function rawPathFrom(value: string): string {
  const schemeSeparator = value.indexOf("://");
  if (schemeSeparator < 0) return "";
  const suffix = value.slice(schemeSeparator + 3);
  const pathStartOffset = suffix.search(/[/?#]/);
  if (pathStartOffset < 0 || suffix[pathStartOffset] !== "/") return "/";
  const pathAndSuffix = suffix.slice(pathStartOffset);
  const pathEndOffset = pathAndSuffix.search(/[?#]/);
  return pathEndOffset < 0 ? pathAndSuffix : pathAndSuffix.slice(0, pathEndOffset);
}

function rejectAmbiguousPath(path: string): void {
  if (ENCODED_SEPARATOR_PATTERN.test(path)) {
    throw new Error("HTTP target URL path must not contain encoded separators");
  }

  for (const segment of path.split("/")) {
    const decodedDotTokens = segment.replace(ENCODED_DOT_TOKEN_PATTERN, ".");
    if (decodedDotTokens === "." || decodedDotTokens === "..") {
      throw new Error("HTTP target URL path must not contain literal or encoded dot segments");
    }
  }
}

function normalizePercentEncoding(value: string): string {
  return value.replace(/%([0-9a-f]{2})/gi, (_match, hex: string) => {
    const character = String.fromCharCode(Number.parseInt(hex, 16));
    return UNRESERVED_CHARACTER_PATTERN.test(character) ? character : `%${hex.toUpperCase()}`;
  });
}

function normalizeHostname(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.toLowerCase();
  }
  const withoutTrailingDot = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  const ascii = domainToASCII(withoutTrailingDot);
  if (ascii.length === 0) {
    throw new Error("HTTP target URL hostname is invalid");
  }
  return ascii.toLowerCase();
}

function serializedHost(hostname: string, port: number | null): string {
  return port === null ? hostname : `${hostname}:${port}`;
}

export function isHttpTargetUrl(value: unknown): value is HttpTargetUrl {
  return typeof value === "object" && value !== null && httpTargets.has(value);
}

export function parseHttpTargetUrl(value: unknown): HttpTargetUrl {
  if (isHttpTargetUrl(value)) return value;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("HTTP target URL must be a non-empty string");
  }
  assertResourceIdentifierByteLength(value, "HTTP target URL");
  if (
    value !== value.trim() ||
    hasControlCharacter(value) ||
    WHITESPACE_PATTERN.test(value)
  ) {
    throw new Error("HTTP target URL must not contain whitespace or control characters");
  }
  if (value.includes("\\")) {
    throw new Error("HTTP target URL must not contain backslashes");
  }
  if (value.includes("#")) {
    throw new Error("HTTP target URL must not contain a fragment");
  }
  if (!/^https?:\/\//i.test(value)) {
    throw new Error("HTTP target URL must use an explicit http:// or https:// scheme");
  }
  if (INVALID_PERCENT_ESCAPE_PATTERN.test(value)) {
    throw new Error("HTTP target URL contains an invalid percent escape");
  }
  rejectEncodedControlCharacters(value);
  const authority = authorityFrom(value);
  if (authority.includes("@")) {
    throw new Error("HTTP target URL must not contain credentials");
  }
  if (authority.includes("%")) {
    throw new Error("HTTP target URL authority must not contain percent escapes");
  }

  const rawPath = rawPathFrom(value);
  rejectAmbiguousPath(rawPath);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("HTTP target URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("HTTP target URL scheme must be http or https");
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error("HTTP target URL must not contain credentials");
  }
  if (parsed.hash.length > 0) {
    throw new Error("HTTP target URL must not contain a fragment");
  }

  const scheme = parsed.protocol.slice(0, -1) as "http" | "https";
  const hostname = normalizeHostname(parsed.hostname);
  const port = parsed.port.length === 0 ? null : Number(parsed.port);
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65_535)) {
    throw new Error("HTTP target URL port is invalid");
  }
  const host = serializedHost(hostname, port);
  const origin = `${scheme}://${host}`;
  const pathname = normalizePercentEncoding(parsed.pathname);
  const search = normalizePercentEncoding(parsed.search);
  const policyKey = `http-target:${origin}${pathname}${search}`;

  const target: HttpTargetUrl = Object.freeze({
    apiValue: value,
    scheme,
    hostname,
    port,
    origin,
    pathname,
    search,
    policyKey
  });
  httpTargets.add(target);
  return target;
}
