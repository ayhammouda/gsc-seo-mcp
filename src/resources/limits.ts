export const RESOURCE_IDENTIFIER_MAX_BYTES = 8_192;
export const SEARCH_CONSOLE_PROPERTY_ALLOWLIST_MAX_ENTRIES = 1_000;

const encoder = new TextEncoder();

export function assertResourceIdentifierByteLength(
  value: string,
  label: string
): void {
  if (encoder.encode(value).byteLength > RESOURCE_IDENTIFIER_MAX_BYTES) {
    throw new Error(
      `${label} must not exceed ${RESOURCE_IDENTIFIER_MAX_BYTES} UTF-8 bytes`
    );
  }
}
