import { describe, it, expect } from "vitest";
import { mapEventToIncome, DEFAULT_MAPPING } from "@/lib/twitch-mapping";

const NOW = new Date("2026-05-13T12:00:00Z");
const MSG_ID = "msg-1";

describe("mapEventToIncome — channel.subscribe", () => {
  it("maps a new Tier 1 sub to an estimated income row", () => {
    const result = mapEventToIncome(
      {
        subscription: { type: "channel.subscribe" },
        event: { user_name: "alice", tier: "1000", is_gift: false },
      },
      MSG_ID,
      NOW,
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe("twitch_sub");
    expect(result!.grossAmount).toBe(DEFAULT_MAPPING.tier1Net);
    expect(result!.netAmount).toBe(DEFAULT_MAPPING.tier1Net);
    expect(result!.confidence).toBe("estimated");
    expect(result!.externalId).toBe(`eventsub:${MSG_ID}`);
    expect(result!.description).toMatch(/alice/);
  });

  it("skips subscribe events that are gifts (the gift event handles those)", () => {
    const result = mapEventToIncome(
      {
        subscription: { type: "channel.subscribe" },
        event: { user_name: "alice", tier: "1000", is_gift: true },
      },
      MSG_ID,
      NOW,
    );
    expect(result).toBeNull();
  });

  it("maps Tier 2 / Tier 3 / Prime to configured estimates", () => {
    const t2 = mapEventToIncome(
      { subscription: { type: "channel.subscribe" }, event: { tier: "2000", user_name: "b" } },
      MSG_ID,
      NOW,
    );
    expect(t2!.grossAmount).toBe(DEFAULT_MAPPING.tier2Net);

    const t3 = mapEventToIncome(
      { subscription: { type: "channel.subscribe" }, event: { tier: "3000", user_name: "c" } },
      MSG_ID,
      NOW,
    );
    expect(t3!.grossAmount).toBe(DEFAULT_MAPPING.tier3Net);
  });
});

describe("mapEventToIncome — channel.subscription.gift", () => {
  it("multiplies per-tier estimate by the gift total", () => {
    const result = mapEventToIncome(
      {
        subscription: { type: "channel.subscription.gift" },
        event: { user_name: "bigSpender", total: 5, tier: "1000", is_anonymous: false },
      },
      MSG_ID,
      NOW,
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe("twitch_gift_sub");
    expect(result!.grossAmount).toBe(DEFAULT_MAPPING.tier1Net * 5);
    expect(result!.description).toMatch(/bigSpender/);
    expect(result!.description).toMatch(/× 5/);
  });

  it("handles anonymous gifters", () => {
    const result = mapEventToIncome(
      {
        subscription: { type: "channel.subscription.gift" },
        event: { total: 1, tier: "1000", is_anonymous: true },
      },
      MSG_ID,
      NOW,
    );
    expect(result!.description).toMatch(/Anonymous/);
  });
});

describe("mapEventToIncome — channel.subscription.message", () => {
  it("maps a resub to twitch_resub with cumulative months in the description", () => {
    const result = mapEventToIncome(
      {
        subscription: { type: "channel.subscription.message" },
        event: { user_name: "alice", tier: "2000", cumulative_months: 12 },
      },
      MSG_ID,
      NOW,
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe("twitch_resub");
    expect(result!.grossAmount).toBe(DEFAULT_MAPPING.tier2Net);
    expect(result!.description).toMatch(/12 months/);
  });
});

describe("mapEventToIncome — channel.cheer", () => {
  it("multiplies bits by the configured value-per-bit", () => {
    const result = mapEventToIncome(
      {
        subscription: { type: "channel.cheer" },
        event: { user_name: "alice", bits: 500, is_anonymous: false },
      },
      MSG_ID,
      NOW,
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe("twitch_bits");
    expect(result!.grossAmount).toBeCloseTo(500 * DEFAULT_MAPPING.bitsValue, 5);
  });

  it("returns null for a zero-bits cheer", () => {
    const result = mapEventToIncome(
      { subscription: { type: "channel.cheer" }, event: { user_name: "x", bits: 0 } },
      MSG_ID,
      NOW,
    );
    expect(result).toBeNull();
  });
});

describe("mapEventToIncome — unknown event type", () => {
  it("returns null for event types we do not map", () => {
    expect(
      mapEventToIncome(
        { subscription: { type: "channel.hype_train.begin" }, event: {} },
        MSG_ID,
        NOW,
      ),
    ).toBeNull();
  });
});

describe("mapEventToIncome — external_id idempotency key", () => {
  it("uses eventsub:<message_id> so re-delivery upserts the same row", () => {
    const result = mapEventToIncome(
      { subscription: { type: "channel.subscribe" }, event: { tier: "1000", user_name: "a" } },
      "uniq-42",
      NOW,
    );
    expect(result!.externalId).toBe("eventsub:uniq-42");
  });
});
