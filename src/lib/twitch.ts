import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { assertStrongProductionSecret } from "@/lib/security";

const TWITCH_OAUTH_BASE = "https://id.twitch.tv";
const TWITCH_HELIX = "https://api.twitch.tv/helix";

export const REQUIRED_SCOPES = [
  "channel:read:subscriptions",
  "bits:read",
] as const;

const TOKEN_SETTING_KEY = "twitch.tokens";

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  userId?: string;
  userLogin?: string;
}

export async function getStoredTokens(): Promise<StoredTokens | null> {
  const row = await db.setting.findUnique({ where: { key: TOKEN_SETTING_KEY } });
  if (!row) return null;
  const v = row.value as Partial<StoredTokens> | null;
  if (!v?.accessToken || !v.refreshToken || !v.expiresAt) return null;
  return {
    accessToken: v.accessToken,
    refreshToken: v.refreshToken,
    expiresAt: v.expiresAt,
    scopes: v.scopes ?? [],
    userId: v.userId,
    userLogin: v.userLogin,
  };
}

async function saveTokens(t: StoredTokens): Promise<void> {
  await db.setting.upsert({
    where: { key: TOKEN_SETTING_KEY },
    create: { key: TOKEN_SETTING_KEY, value: t as unknown as object },
    update: { value: t as unknown as object },
  });
}

export async function clearTokens(): Promise<void> {
  await db.setting.deleteMany({ where: { key: TOKEN_SETTING_KEY } });
}

export function buildOAuthAuthorizeUrl(state: string): string {
  const clientId = requireEnv("TWITCH_CLIENT_ID");
  const redirectUri = requireEnv("TWITCH_REDIRECT_URI");
  const url = new URL(`${TWITCH_OAUTH_BASE}/oauth2/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", REQUIRED_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("force_verify", "true");
  return url.toString();
}

export function newOAuthState(): { state: string; signed: string } {
  const state = randomBytes(16).toString("hex");
  const signed = signState(state);
  return { state, signed };
}

export function verifyOAuthState(received: string, signedCookie: string): boolean {
  if (!received || !signedCookie) return false;
  const expected = signState(received);
  const a = Buffer.from(expected);
  const b = Buffer.from(signedCookie);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function signState(value: string): string {
  const secret = requireEnv("SESSION_SECRET");
  assertStrongProductionSecret("SESSION_SECRET", secret);
  return createHmac("sha256", secret).update(`twitch-oauth:${value}`).digest("hex");
}

export async function exchangeCodeForTokens(code: string): Promise<StoredTokens> {
  const clientId = requireEnv("TWITCH_CLIENT_ID");
  const clientSecret = requireEnv("TWITCH_CLIENT_SECRET");
  const redirectUri = requireEnv("TWITCH_REDIRECT_URI");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${TWITCH_OAUTH_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Twitch token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string[];
  };

  const tokens: StoredTokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    scopes: json.scope ?? [],
  };

  const userInfo = await fetchUserInfo(tokens.accessToken);
  if (userInfo) {
    tokens.userId = userInfo.id;
    tokens.userLogin = userInfo.login;
  }
  await saveTokens(tokens);
  return tokens;
}

async function refreshTokens(refreshToken: string): Promise<StoredTokens> {
  const clientId = requireEnv("TWITCH_CLIENT_ID");
  const clientSecret = requireEnv("TWITCH_CLIENT_SECRET");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(`${TWITCH_OAUTH_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Twitch token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string[];
  };
  const existing = await getStoredTokens();
  const next: StoredTokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    scopes: json.scope ?? existing?.scopes ?? [],
    userId: existing?.userId,
    userLogin: existing?.userLogin,
  };
  await saveTokens(next);
  return next;
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getStoredTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken;
  try {
    const refreshed = await refreshTokens(tokens.refreshToken);
    return refreshed.accessToken;
  } catch {
    return null;
  }
}

async function fetchUserInfo(accessToken: string): Promise<{ id: string; login: string } | null> {
  const clientId = requireEnv("TWITCH_CLIENT_ID");
  const res = await fetch(`${TWITCH_HELIX}/users`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "client-id": clientId,
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Array<{ id: string; login: string }> };
  return json.data?.[0] ?? null;
}

export function verifyEventSubSignature(
  headers: {
    messageId: string | null;
    timestamp: string | null;
    signature: string | null;
  },
  rawBody: string,
  secret: string = process.env.TWITCH_EVENTSUB_SECRET ?? "",
): boolean {
  const { messageId, timestamp, signature } = headers;
  assertStrongProductionSecret("TWITCH_EVENTSUB_SECRET", secret);
  if (!messageId || !timestamp || !signature || !secret) return false;

  const tsMs = Date.parse(timestamp);
  if (!Number.isFinite(tsMs)) return false;
  if (Math.abs(Date.now() - tsMs) > 10 * 60 * 1000) return false;

  const expected =
    "sha256=" +
    createHmac("sha256", secret).update(messageId + timestamp + rawBody).digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface EventSubSubscription {
  id: string;
  type: string;
  version: string;
  status: string;
  condition: Record<string, unknown>;
}

export interface RegisterPlan {
  type: string;
  version: string;
  condition: Record<string, unknown>;
}

export async function appAccessToken(): Promise<string> {
  const clientId = requireEnv("TWITCH_CLIENT_ID");
  const clientSecret = requireEnv("TWITCH_CLIENT_SECRET");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });
  const res = await fetch(`${TWITCH_OAUTH_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Twitch app token failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function listEventSubSubscriptions(): Promise<EventSubSubscription[]> {
  const clientId = requireEnv("TWITCH_CLIENT_ID");
  const appToken = await appAccessToken();
  const res = await fetch(`${TWITCH_HELIX}/eventsub/subscriptions`, {
    headers: {
      authorization: `Bearer ${appToken}`,
      "client-id": clientId,
    },
  });
  if (!res.ok) {
    throw new Error(`Twitch list subscriptions failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: EventSubSubscription[] };
  return json.data ?? [];
}

export async function createEventSubSubscription(
  plan: RegisterPlan,
): Promise<EventSubSubscription> {
  const clientId = requireEnv("TWITCH_CLIENT_ID");
  const secret = requireEnv("TWITCH_EVENTSUB_SECRET");
  const baseUrl = requireEnv("PUBLIC_BASE_URL");
  const appToken = await appAccessToken();

  const res = await fetch(`${TWITCH_HELIX}/eventsub/subscriptions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${appToken}`,
      "client-id": clientId,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: plan.type,
      version: plan.version,
      condition: plan.condition,
      transport: {
        method: "webhook",
        callback: `${baseUrl.replace(/\/$/, "")}/api/twitch/eventsub`,
        secret,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Twitch create subscription failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: EventSubSubscription[] };
  return json.data[0];
}

export async function deleteEventSubSubscription(id: string): Promise<void> {
  const clientId = requireEnv("TWITCH_CLIENT_ID");
  const appToken = await appAccessToken();
  const res = await fetch(`${TWITCH_HELIX}/eventsub/subscriptions?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${appToken}`,
      "client-id": clientId,
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Twitch delete subscription failed: ${res.status} ${await res.text()}`);
  }
}

export function defaultSubscriptionPlans(broadcasterId: string): RegisterPlan[] {
  const condition = { broadcaster_user_id: broadcasterId };
  return [
    { type: "channel.subscribe", version: "1", condition },
    { type: "channel.subscription.gift", version: "1", condition },
    { type: "channel.subscription.message", version: "1", condition },
    { type: "channel.cheer", version: "1", condition },
  ];
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  if (name.includes("SECRET")) assertStrongProductionSecret(name, v);
  return v;
}
