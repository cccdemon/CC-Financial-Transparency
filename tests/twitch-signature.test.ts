import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verifyEventSubSignature } from "@/lib/twitch";

const SECRET = "test-eventsub-secret";

function sign(messageId: string, timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(messageId + timestamp + body).digest("hex");
}

describe("verifyEventSubSignature", () => {
  const fixedNow = new Date("2026-05-13T12:00:00Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a valid signature within the freshness window", () => {
    const messageId = "abc-123";
    const timestamp = new Date(fixedNow).toISOString();
    const body = JSON.stringify({ challenge: "hi" });
    const signature = sign(messageId, timestamp, body);

    expect(
      verifyEventSubSignature({ messageId, timestamp, signature }, body, SECRET),
    ).toBe(true);
  });

  it("rejects when the signature does not match the body", () => {
    const messageId = "abc-123";
    const timestamp = new Date(fixedNow).toISOString();
    const body = JSON.stringify({ challenge: "hi" });
    const signature = sign(messageId, timestamp, "tampered");

    expect(
      verifyEventSubSignature({ messageId, timestamp, signature }, body, SECRET),
    ).toBe(false);
  });

  it("rejects messages older than 10 minutes", () => {
    const messageId = "abc-123";
    const stale = new Date(fixedNow - 11 * 60 * 1000).toISOString();
    const body = "{}";
    const signature = sign(messageId, stale, body);

    expect(
      verifyEventSubSignature({ messageId, timestamp: stale, signature }, body, SECRET),
    ).toBe(false);
  });

  it("rejects when required headers are missing", () => {
    expect(
      verifyEventSubSignature({ messageId: null, timestamp: "x", signature: "y" }, "{}", SECRET),
    ).toBe(false);
    expect(
      verifyEventSubSignature({ messageId: "x", timestamp: null, signature: "y" }, "{}", SECRET),
    ).toBe(false);
    expect(
      verifyEventSubSignature({ messageId: "x", timestamp: "x", signature: null }, "{}", SECRET),
    ).toBe(false);
  });

  it("rejects when the secret is empty", () => {
    const messageId = "abc-123";
    const timestamp = new Date(fixedNow).toISOString();
    const body = "{}";
    const signature = sign(messageId, timestamp, body);
    expect(verifyEventSubSignature({ messageId, timestamp, signature }, body, "")).toBe(false);
  });
});
