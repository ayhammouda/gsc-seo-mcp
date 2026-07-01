import { describe, expect, it } from "vitest";
import { validateOAuthCallback } from "../src/oauth.js";

describe("validateOAuthCallback", () => {
  it("accepts only the expected callback path and state", () => {
    const code = validateOAuthCallback(new URL("http://127.0.0.1/oauth2callback?code=abc&state=expected"), "expected");

    expect(code).toBe("abc");
    expect(() => validateOAuthCallback(new URL("http://127.0.0.1/wrong?code=abc&state=expected"), "expected")).toThrow(
      /callback path/i
    );
    expect(() => validateOAuthCallback(new URL("http://127.0.0.1/oauth2callback?code=abc&state=other"), "expected")).toThrow(
      /state/i
    );
    expect(() => validateOAuthCallback(new URL("http://127.0.0.1/oauth2callback?state=expected"), "expected")).toThrow(
      /code/i
    );
  });
});
