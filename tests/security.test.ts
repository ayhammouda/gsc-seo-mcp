import { chmod, mkdir, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileTokenStore, getAuthStatus } from "../src/auth/token-store.js";
import { createMemoryLogger, redactSecrets } from "../src/security.js";

describe("redactSecrets", () => {
  it("removes access tokens, refresh tokens, auth codes, and client secrets", () => {
    const raw =
      'access_token=ya29.access refresh_token=1//refresh code=4/abc client_secret=GOCSPX-secret Authorization: Bearer bearer-secret {"authorization":"Bearer json-secret"}';

    const redacted = redactSecrets(raw);

    expect(redacted).not.toContain("ya29.access");
    expect(redacted).not.toContain("1//refresh");
    expect(redacted).not.toContain("4/abc");
    expect(redacted).not.toContain("GOCSPX-secret");
    expect(redacted).not.toContain("bearer-secret");
    expect(redacted).not.toContain("json-secret");
    expect(redacted).toContain("[REDACTED]");
  });
});

describe("FileTokenStore", () => {
  it("stores tokens with restrictive file permissions and reports status without secrets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gsc-token-store-"));
    const path = join(dir, "tokens.json");
    const store = new FileTokenStore(path);

    await store.save({
      tokens: {
        access_token: "ya29.access",
        refresh_token: "1//refresh",
        expiry_date: Date.now() + 60_000
      },
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"]
    });

    const mode = (await stat(path)).mode & 0o777;
    const status = await getAuthStatus(store);
    const serialized = JSON.stringify(status);

    expect(mode).toBe(0o600);
    expect(status.credentialsPresent).toBe(true);
    expect(status.scopes).toEqual(["https://www.googleapis.com/auth/webmasters.readonly"]);
    expect(serialized).not.toContain("ya29.access");
    expect(serialized).not.toContain("1//refresh");
  });

  it("does not chmod an existing parent directory when saving tokens", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gsc-token-store-parent-"));
    const parent = join(dir, "shared");
    await mkdir(parent, { mode: 0o755 });
    await chmod(parent, 0o755);
    const store = new FileTokenStore(join(parent, "tokens.json"));

    await store.save({ tokens: { refresh_token: "1//refresh" }, scopes: [] });

    const parentMode = (await stat(parent)).mode & 0o777;
    expect(parentMode).toBe(0o755);
  });
});

describe("createMemoryLogger", () => {
  it("never stores secrets in log messages", () => {
    const logger = createMemoryLogger();

    logger.info("token ya29.access and client_secret=GOCSPX-secret");

    expect(logger.entries.join("\n")).not.toContain("ya29.access");
    expect(logger.entries.join("\n")).not.toContain("GOCSPX-secret");
  });
});
