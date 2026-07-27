import { describe, expect, it } from "vitest";
import { isWellFormedBcp47LanguageTag } from "../../src/resources/index.js";

describe("BCP-47 language tags", () => {
  it.each([
    "en",
    "en-US",
    "zh-Hant-TW",
    "de-CH-1901",
    "sl-rozaj-biske",
    "en-a-extend1-b-extend2-x-private",
    "x-private",
    "i-klingon",
    "en-GB-oed",
    "zh-min-nan"
  ])("accepts the well-formed tag %s", (tag) => {
    expect(isWellFormedBcp47LanguageTag(tag)).toBe(true);
  });

  it.each([
    "",
    "x",
    "en-",
    "-en",
    "en_US",
    "1n-US",
    "en-a",
    "en-a-one-a-two",
    "sl-rozaj-rozaj",
    "en-x",
    "en-abcdefgh9"
  ])("rejects the malformed tag %j", (tag) => {
    expect(isWellFormedBcp47LanguageTag(tag)).toBe(false);
  });
});
