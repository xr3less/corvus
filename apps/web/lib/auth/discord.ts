// Discord OAuth2 client helpers (authorization-code flow, server side only).
// Structure borrowed from the discord.js official OAuth2 guide (form-encoded
// code exchange + GET /users/@me with a Bearer token) and from the arctic
// provider shape (small staged helpers: authorize-URL builder, code exchange,
// profile fetch). No tokens are ever logged, stored, or reflected here.

export const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
export const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
export const DISCORD_USER_URL = 'https://discord.com/api/users/@me';
export const OAUTH_SCOPE = 'identify';

export interface DiscordOAuthConfig {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  redirectUri: string;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type DiscordApiErrorCode = 'token_exchange_failed' | 'profile_fetch_failed';

export class DiscordApiError extends Error {
  readonly code: DiscordApiErrorCode;

  constructor(code: DiscordApiErrorCode) {
    super(code);
    this.name = 'DiscordApiError';
    this.code = code;
  }
}

export interface DiscordUser {
  id: string;
  email: string | null;
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  return typeof value === 'string' ? value.trim() : '';
}

// Secrets come from env only. NEXT_PUBLIC_ prefix is forbidden on the secret:
// this module never touches a NEXT_PUBLIC_ variable.
export function getDiscordConfig(env: NodeJS.ProcessEnv = process.env): DiscordOAuthConfig {
  const clientId = readEnv(env, 'DISCORD_CLIENT_ID');
  const clientSecret = readEnv(env, 'DISCORD_CLIENT_SECRET');
  const appUrl = readEnv(env, 'APP_URL').replace(/\/+$/, '');
  if (clientId === '' || clientSecret === '' || appUrl === '') {
    throw new Error('discord_oauth_not_configured');
  }
  return { clientId, clientSecret, appUrl, redirectUri: `${appUrl}/api/auth/callback` };
}

export function buildAuthorizeUrl(state: string, config: DiscordOAuthConfig): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: OAUTH_SCOPE,
    state,
  });
  return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Exchanges an authorization code for a user access token. Returns the raw
// access token to the caller; the caller must not persist or log it (V1-1
// stores session ids only — no OAuth tokens at rest).
export async function exchangeCodeForToken(
  code: string,
  config: DiscordOAuthConfig,
  fetchFn: FetchFn = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchFn(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        scope: OAUTH_SCOPE,
      }).toString(),
    });
  } catch {
    throw new DiscordApiError('token_exchange_failed');
  }
  if (!response.ok) {
    throw new DiscordApiError('token_exchange_failed');
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new DiscordApiError('token_exchange_failed');
  }
  if (!isRecord(data) || typeof data.access_token !== 'string' || data.access_token === '') {
    throw new DiscordApiError('token_exchange_failed');
  }
  return data.access_token;
}

export async function fetchDiscordUser(
  accessToken: string,
  fetchFn: FetchFn = fetch,
): Promise<DiscordUser> {
  let response: Response;
  try {
    response = await fetchFn(DISCORD_USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new DiscordApiError('profile_fetch_failed');
  }
  if (!response.ok) {
    throw new DiscordApiError('profile_fetch_failed');
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new DiscordApiError('profile_fetch_failed');
  }
  if (!isRecord(data) || typeof data.id !== 'string' || data.id === '') {
    throw new DiscordApiError('profile_fetch_failed');
  }
  return { id: data.id, email: typeof data.email === 'string' ? data.email : null };
}
