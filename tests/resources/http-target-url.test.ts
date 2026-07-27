import { describe, expect, it } from "vitest";
import {
  isHttpTargetUrl,
  parseHttpTargetUrl,
  RESOURCE_IDENTIFIER_MAX_BYTES
} from "../../src/resources/index.js";

describe("HttpTargetUrl", () => {
  it("preserves the exact API value while normalizing policy components", () => {
    const apiValue = "HTTPS://BÜCHER.Example:443/docs/%7euser?q=%7evalue";
    const parsed = parseHttpTargetUrl(apiValue);

    expect(parsed).toEqual({
      apiValue,
      scheme: "https",
      hostname: "xn--bcher-kva.example",
      port: null,
      origin: "https://xn--bcher-kva.example",
      pathname: "/docs/~user",
      search: "?q=~value",
      policyKey: "http-target:https://xn--bcher-kva.example/docs/~user?q=~value"
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(isHttpTargetUrl(parsed)).toBe(true);
    expect(parseHttpTargetUrl(parsed)).toBe(parsed);
  });

  it.each([
    ["http://example.com:80/a", "http://example.com/a"],
    ["https://example.com:443/a", "https://example.com/a"],
    ["https://EXAMPLE.com./a", "https://example.com/a"],
    ["https://example.com/%61", "https://example.com/a"]
  ])("normalizes equivalent policy key %s to %s", (left, right) => {
    expect(parseHttpTargetUrl(left).policyKey).toBe(parseHttpTargetUrl(right).policyKey);
  });

  it("preserves non-default ports and path/query distinctions", () => {
    expect(parseHttpTargetUrl("https://example.com:8443/a").origin).toBe("https://example.com:8443");
    expect(parseHttpTargetUrl("https://example.com/a?x=1").policyKey).not.toBe(
      parseHttpTargetUrl("https://example.com/a?x=2").policyKey
    );
  });

  it.each([
    "file:///etc/passwd",
    "ftp://example.com/file",
    "data:text/plain,hello",
    "https:example.com/path",
    "//example.com/path",
    "example.com/path"
  ])("rejects non-HTTP or implicitly repaired URL %s", (value) => {
    expect(() => parseHttpTargetUrl(value)).toThrow(/http/i);
  });

  it.each([
    "https://user@example.com/",
    "https://user:password@example.com/",
    "https://@example.com/",
    "https://example.com/#fragment",
    "https://example.com/#",
    " https://example.com/",
    "https://example.com/ ",
    "https://example.com/a b",
    "https://example.com/\tpath",
    "https://example.com\\evil"
  ])("rejects credentials, fragments, whitespace, controls, or backslashes in %j", (value) => {
    expect(() => parseHttpTargetUrl(value)).toThrow();
  });

  it.each([
    "https://example.com/%",
    "https://example.com/%2",
    "https://example.com/%zz",
    "https://example.com/%00",
    "https://example.com/%251f",
    "https://example.com/%C2%80",
    "https://example.com/%C2%9F",
    "https://example.com/%25C2%2580",
    "https://example.com/?q=%C2%80",
    "https://example.com/%80",
    "https://example.com/?q=%7f",
    "https://example%2ecom/",
    "https://example.com/a%2fb",
    "https://example.com/a%5cb",
    "https://example.com/a%252fb",
    "https://example.com/./a",
    "https://example.com/a/../b",
    "https://example.com/%2e/a",
    "https://example.com/%2e%2e/a",
    "https://example.com/.%2e/a",
    "https://example.com/%252e%252e/a"
  ])("rejects malformed or ambiguous path encoding in %s", (value) => {
    expect(() => parseHttpTargetUrl(value)).toThrow();
  });

  it("allows an encoded dot that is not a dot segment and normalizes it", () => {
    expect(parseHttpTargetUrl("https://example.com/file%2Etxt").pathname).toBe("/file.txt");
  });

  it.each([
    "https://example.com/%E2%82%AC",
    "https://example.com/%F0%9F%9A%80",
    "https://example.com/?q=100%25"
  ])("accepts valid non-control UTF-8 percent encoding in %s", (value) => {
    expect(() => parseHttpTargetUrl(value)).not.toThrow();
  });

  it("enforces the exact UTF-8 identifier byte boundary in the shared parser", () => {
    const prefix = "https://example.com/";
    const exact = `${prefix}${"a".repeat(
      RESOURCE_IDENTIFIER_MAX_BYTES - Buffer.byteLength(prefix)
    )}`;

    expect(Buffer.byteLength(exact)).toBe(RESOURCE_IDENTIFIER_MAX_BYTES);
    expect(() => parseHttpTargetUrl(exact)).not.toThrow();
    expect(() => parseHttpTargetUrl(`${exact}a`)).toThrow(/8192 UTF-8 bytes/);
    expect(() =>
      parseHttpTargetUrl(
        `${prefix}${"é".repeat(
          Math.floor((RESOURCE_IDENTIFIER_MAX_BYTES - Buffer.byteLength(prefix)) / 2) + 1
        )}`
      )
    ).toThrow(/8192 UTF-8 bytes/);
  });

  it("rejects structurally forged target values", () => {
    const forged = Object.freeze({
      apiValue: "https://example.com/",
      scheme: "https",
      hostname: "example.com",
      port: null,
      origin: "https://example.com",
      pathname: "/",
      search: "",
      policyKey: "http-target:https://example.com/"
    });

    expect(isHttpTargetUrl(forged)).toBe(false);
    expect(() => parseHttpTargetUrl(forged)).toThrow();
  });
});
