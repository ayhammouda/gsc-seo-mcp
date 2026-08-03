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

function createLogger(write: (entry: string) => void): Logger {
  const log = (level: string, message: string): void => {
    write(`[${level}] ${redactSecrets(message)}`);
  };
  return {
    debug: (message) => log("debug", message),
    info: (message) => log("info", message),
    warn: (message) => log("warn", message),
    error: (message) => log("error", message)
  };
}

export function createStderrLogger(): Logger {
  return createLogger((entry) => process.stderr.write(`${entry}\n`));
}

export function createMemoryLogger(): Logger & { entries: string[] } {
  const entries: string[] = [];
  return {
    entries,
    ...createLogger((entry) => entries.push(entry))
  };
}
