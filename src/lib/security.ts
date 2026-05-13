import { headers } from "next/headers";

const ADMIN_FALLBACK = "/admin";
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

const loginFailures = new Map<string, { count: number; firstFailureAt: number }>();

export function safeAdminRedirect(value: string | undefined | null, fallback = ADMIN_FALLBACK): string {
  if (!value || value.startsWith("//")) return fallback;
  if (value !== "/admin" && !value.startsWith("/admin/")) return fallback;
  if (value.includes("\\") || value.includes("\n") || value.includes("\r")) return fallback;
  return value;
}

export async function assertSameOriginRequest(): Promise<void> {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("host");
  const forwardedProto = h.get("x-forwarded-proto") ?? "https";

  if (!origin || !host) return;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error("Invalid request origin");
  }

  const expected = process.env.PUBLIC_BASE_URL
    ? new URL(process.env.PUBLIC_BASE_URL)
    : new URL(`${forwardedProto}://${host}`);

  if (parsed.host !== expected.host || parsed.protocol !== expected.protocol) {
    throw new Error("Cross-origin admin request blocked");
  }
}

export async function loginRateLimitKey(email: string): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `${ip}:${email.trim().toLowerCase()}`;
}

export function isLoginRateLimited(key: string, now = Date.now()): boolean {
  const entry = loginFailures.get(key);
  if (!entry) return false;
  if (now - entry.firstFailureAt > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return false;
  }
  return entry.count >= MAX_LOGIN_FAILURES;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const entry = loginFailures.get(key);
  if (!entry || now - entry.firstFailureAt > LOGIN_WINDOW_MS) {
    loginFailures.set(key, { count: 1, firstFailureAt: now });
    return;
  }
  entry.count += 1;
}

export function clearLoginFailures(key: string): void {
  loginFailures.delete(key);
}

export function csvSafeCell(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (!/[",\r\n]/.test(neutralized)) return neutralized;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function assertStrongProductionSecret(name: string, value: string | undefined): void {
  if (process.env.NODE_ENV !== "production") return;
  const v = value ?? "";
  const lower = v.toLowerCase();
  if (
    v.length < 32 ||
    lower.includes("change-me") ||
    lower.includes("dev-") ||
    lower.includes("test") ||
    lower.includes("secret")
  ) {
    throw new Error(`${name} must be a strong production secret`);
  }
}
