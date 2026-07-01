import { mkdir, readFile, rename, stat, writeFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";

export interface OAuthTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
  token_type?: string | null;
  id_token?: string | null;
}

export interface StoredCredentials {
  tokens: OAuthTokens;
  scopes: string[];
}

export interface AuthStatus {
  credentialsPresent: boolean;
  hasRefreshToken: boolean;
  scopes: string[];
  expiryDate?: number;
  tokenStorePath?: string;
}

export interface TokenStore {
  path?: string;
  load(): Promise<StoredCredentials | null>;
  save(credentials: StoredCredentials): Promise<void>;
}

export class FileTokenStore implements TokenStore {
  constructor(public readonly path: string) {}

  async load(): Promise<StoredCredentials | null> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as StoredCredentials;
      return {
        tokens: parsed.tokens,
        scopes: Array.isArray(parsed.scopes) ? parsed.scopes : []
      };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async save(credentials: StoredCredentials): Promise<void> {
    // TODO(prod): replace file store with encrypted OS-backed storage.
    const dir = dirname(this.path);
    const createdDir = await mkdir(dir, { recursive: true, mode: 0o700 });
    if (createdDir !== undefined) {
      await chmod(dir, 0o700);
    }
    const tmpPath = `${this.path}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, this.path);
    await chmod(this.path, 0o600);
  }
}

export async function getAuthStatus(store: TokenStore): Promise<AuthStatus> {
  const stored = await store.load();
  if (!stored) {
    return {
      credentialsPresent: false,
      hasRefreshToken: false,
      scopes: [],
      ...(store.path ? { tokenStorePath: store.path } : {})
    };
  }

  const status: AuthStatus = {
    credentialsPresent: true,
    hasRefreshToken: Boolean(stored.tokens.refresh_token),
    scopes: stored.scopes,
    ...(store.path ? { tokenStorePath: store.path } : {})
  };
  if (typeof stored.tokens.expiry_date === "number") {
    status.expiryDate = stored.tokens.expiry_date;
  }
  return status;
}

export async function tokenFileMode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}
