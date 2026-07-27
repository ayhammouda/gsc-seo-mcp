const ALPHA_PATTERN = /^[a-z]+$/i;
const DIGIT_PATTERN = /^\d+$/;
const ALPHANUMERIC_PATTERN = /^[a-z0-9]+$/i;

const GRANDFATHERED_TAGS: ReadonlySet<string> = new Set([
  "art-lojban",
  "cel-gaulish",
  "en-gb-oed",
  "i-ami",
  "i-bnn",
  "i-default",
  "i-enochian",
  "i-hak",
  "i-klingon",
  "i-lux",
  "i-mingo",
  "i-navajo",
  "i-pwn",
  "i-tao",
  "i-tay",
  "i-tsu",
  "no-bok",
  "no-nyn",
  "sgn-be-fr",
  "sgn-be-nl",
  "sgn-ch-de",
  "zh-guoyu",
  "zh-hakka",
  "zh-min",
  "zh-min-nan",
  "zh-xiang"
]);

function isAlpha(token: string, minimum: number, maximum = minimum): boolean {
  return (
    token.length >= minimum &&
    token.length <= maximum &&
    ALPHA_PATTERN.test(token)
  );
}

function isAlphanumeric(
  token: string,
  minimum: number,
  maximum = minimum
): boolean {
  return (
    token.length >= minimum &&
    token.length <= maximum &&
    ALPHANUMERIC_PATTERN.test(token)
  );
}

function isVariant(token: string): boolean {
  return (
    isAlphanumeric(token, 5, 8) ||
    (token.length === 4 &&
      DIGIT_PATTERN.test(token[0] ?? "") &&
      ALPHANUMERIC_PATTERN.test(token))
  );
}

function isPrivateUseSequence(tokens: readonly string[], start: number): boolean {
  return (
    start < tokens.length &&
    tokens
      .slice(start)
      .every((token) => isAlphanumeric(token, 1, 8))
  );
}

/**
 * RFC 5646 well-formed language-tag syntax, including grandfathered and
 * private-use forms. Registry membership and preferred-value replacement are
 * intentionally not required by the Google wire contract.
 */
export function isWellFormedBcp47LanguageTag(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const normalized = value.toLowerCase();
  if (GRANDFATHERED_TAGS.has(normalized)) return true;

  const tokens = value.split("-");
  if (
    tokens.length === 0 ||
    tokens.some(
      (token) =>
        token.length === 0 ||
        token.length > 8 ||
        !ALPHANUMERIC_PATTERN.test(token)
    )
  ) {
    return false;
  }

  if (tokens[0]?.toLowerCase() === "x") {
    return isPrivateUseSequence(tokens, 1);
  }

  let index = 0;
  const language = tokens[index];
  if (language === undefined) return false;
  if (isAlpha(language, 2, 3)) {
    index += 1;
    let extlangCount = 0;
    while (
      extlangCount < 3 &&
      tokens[index] !== undefined &&
      isAlpha(tokens[index]!, 3)
    ) {
      index += 1;
      extlangCount += 1;
    }
  } else if (isAlpha(language, 4) || isAlpha(language, 5, 8)) {
    index += 1;
  } else {
    return false;
  }

  if (tokens[index] !== undefined && isAlpha(tokens[index]!, 4)) {
    index += 1;
  }
  const region = tokens[index];
  if (
    region !== undefined &&
    (isAlpha(region, 2) ||
      (region.length === 3 && DIGIT_PATTERN.test(region)))
  ) {
    index += 1;
  }

  const variants = new Set<string>();
  while (tokens[index] !== undefined && isVariant(tokens[index]!)) {
    const variant = tokens[index]!.toLowerCase();
    if (variants.has(variant)) return false;
    variants.add(variant);
    index += 1;
  }

  const extensionSingletons = new Set<string>();
  while (
    tokens[index] !== undefined &&
    tokens[index]!.length === 1 &&
    ALPHANUMERIC_PATTERN.test(tokens[index]!) &&
    tokens[index]!.toLowerCase() !== "x"
  ) {
    const singleton = tokens[index]!.toLowerCase();
    if (extensionSingletons.has(singleton)) return false;
    extensionSingletons.add(singleton);
    index += 1;
    const extensionStart = index;
    while (
      tokens[index] !== undefined &&
      isAlphanumeric(tokens[index]!, 2, 8)
    ) {
      index += 1;
    }
    if (index === extensionStart) return false;
  }

  if (tokens[index]?.toLowerCase() === "x") {
    return isPrivateUseSequence(tokens, index + 1);
  }
  return index === tokens.length;
}
