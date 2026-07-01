export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const SECRET_PATTERNS: RegExp[] = [
  /\b(access_token|refresh_token|client_secret|code)=([^\s&]+)/gi,
  /"(access_token|refresh_token|client_secret|code)"\s*:\s*"[^"]+"/gi,
  /\bauthorization\s*:\s*bearer\s+[^\s,}]+/gi,
  /"authorization"\s*:\s*"bearer\s+[^"]+"/gi,
  /\bya29\.[A-Za-z0-9._-]+/g,
  /\b1\/\/[A-Za-z0-9._-]+/g,
  /\b4\/[A-Za-z0-9._-]+/g,
  /\bGOCSPX-[A-Za-z0-9._-]+/g
];

export function redactSecrets(value: unknown): string {
  let redacted = typeof value === "string" ? value : JSON.stringify(value);
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match: string, key?: string) => {
      if (key && match.includes("=")) return `${key}=[REDACTED]`;
      if (key && match.includes(":")) return `"${key}":"[REDACTED]"`;
      return "[REDACTED]";
    });
  }
  return redacted;
}

export function createStderrLogger(): Logger {
  const write = (level: string, message: string) => {
    process.stderr.write(`[${level}] ${redactSecrets(message)}\n`);
  };
  return {
    debug: (message) => write("debug", message),
    info: (message) => write("info", message),
    warn: (message) => write("warn", message),
    error: (message) => write("error", message)
  };
}

export function createMemoryLogger(): Logger & { entries: string[] } {
  const entries: string[] = [];
  const push = (level: string, message: string) => entries.push(`[${level}] ${redactSecrets(message)}`);
  return {
    entries,
    debug: (message) => push("debug", message),
    info: (message) => push("info", message),
    warn: (message) => push("warn", message),
    error: (message) => push("error", message)
  };
}
