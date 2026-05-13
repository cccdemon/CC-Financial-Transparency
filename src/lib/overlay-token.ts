import { createHash, timingSafeEqual } from "node:crypto";

// MVP: a single overlay token shared via PUBLIC_OVERLAY_TOKEN env var.
// Per the spec, only the hash is stored — but for Phase 1 we accept the
// token directly from env. When we add per-overlay token rotation, we'll
// switch to hashing user-supplied tokens against `overlay_configs.public_token_hash`.

export function isOverlayTokenValid(input: string | null | undefined): boolean {
  const expected = process.env.PUBLIC_OVERLAY_TOKEN ?? "";
  if (!expected || !input) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function hashOverlayToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
