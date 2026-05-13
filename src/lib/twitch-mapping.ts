import type { IncomeSource } from "@prisma/client";

export interface TwitchEventEnvelope {
  subscription: { type: string };
  event: Record<string, unknown>;
}

export interface MappedIncome {
  source: IncomeSource;
  occurredAt: Date;
  grossAmount: number;
  netAmount: number | null;
  currency: string;
  confidence: "estimated";
  public: boolean;
  description: string;
  externalId: string;
}

export interface MappingDefaults {
  tier1Net: number;
  tier2Net: number;
  tier3Net: number;
  primeNet: number;
  bitsValue: number;
  currency: string;
}

export const DEFAULT_MAPPING: MappingDefaults = {
  tier1Net: 2.5,
  tier2Net: 5.0,
  tier3Net: 12.5,
  primeNet: 2.5,
  bitsValue: 0.01,
  currency: "EUR",
};

function netForTier(tier: string | undefined, isPrime: boolean, d: MappingDefaults): number {
  if (isPrime) return d.primeNet;
  switch (tier) {
    case "1000":
      return d.tier1Net;
    case "2000":
      return d.tier2Net;
    case "3000":
      return d.tier3Net;
    default:
      return d.tier1Net;
  }
}

export function mapEventToIncome(
  envelope: TwitchEventEnvelope,
  messageId: string,
  now: Date = new Date(),
  defaults: MappingDefaults = DEFAULT_MAPPING,
): MappedIncome | null {
  const { subscription, event } = envelope;
  if (!event || typeof event !== "object") return null;

  switch (subscription.type) {
    case "channel.subscribe":
      return mapSubscribe(event, messageId, now, defaults);
    case "channel.subscription.gift":
      return mapGift(event, messageId, now, defaults);
    case "channel.subscription.message":
      return mapResub(event, messageId, now, defaults);
    case "channel.cheer":
      return mapCheer(event, messageId, now, defaults);
    default:
      return null;
  }
}

function mapSubscribe(
  e: Record<string, unknown>,
  messageId: string,
  now: Date,
  d: MappingDefaults,
): MappedIncome | null {
  if (e.is_gift === true) return null;
  const tier = typeof e.tier === "string" ? e.tier : undefined;
  const userName = typeof e.user_name === "string" ? e.user_name : "anonymous";
  const net = netForTier(tier, false, d);
  return {
    source: "twitch_sub",
    occurredAt: now,
    grossAmount: net,
    netAmount: net,
    currency: d.currency,
    confidence: "estimated",
    public: true,
    description: `New sub (Tier ${tier ?? "?"}) — ${userName}`,
    externalId: `eventsub:${messageId}`,
  };
}

function mapGift(
  e: Record<string, unknown>,
  messageId: string,
  now: Date,
  d: MappingDefaults,
): MappedIncome | null {
  const total = typeof e.total === "number" && e.total > 0 ? e.total : 1;
  const tier = typeof e.tier === "string" ? e.tier : undefined;
  const gifter = e.is_anonymous === true
    ? "Anonymous"
    : typeof e.user_name === "string"
      ? e.user_name
      : "Unknown";
  const perGift = netForTier(tier, false, d);
  const totalNet = perGift * total;
  return {
    source: "twitch_gift_sub",
    occurredAt: now,
    grossAmount: totalNet,
    netAmount: totalNet,
    currency: d.currency,
    confidence: "estimated",
    public: true,
    description: `Gift sub × ${total} (Tier ${tier ?? "?"}) — ${gifter}`,
    externalId: `eventsub:${messageId}`,
  };
}

function mapResub(
  e: Record<string, unknown>,
  messageId: string,
  now: Date,
  d: MappingDefaults,
): MappedIncome | null {
  const tier = typeof e.tier === "string" ? e.tier : undefined;
  const months = typeof e.cumulative_months === "number" ? e.cumulative_months : undefined;
  const userName = typeof e.user_name === "string" ? e.user_name : "anonymous";
  const net = netForTier(tier, false, d);
  return {
    source: "twitch_resub",
    occurredAt: now,
    grossAmount: net,
    netAmount: net,
    currency: d.currency,
    confidence: "estimated",
    public: true,
    description: `Resub (Tier ${tier ?? "?"}, ${months ?? "?"} months) — ${userName}`,
    externalId: `eventsub:${messageId}`,
  };
}

function mapCheer(
  e: Record<string, unknown>,
  messageId: string,
  now: Date,
  d: MappingDefaults,
): MappedIncome | null {
  const bits = typeof e.bits === "number" && e.bits > 0 ? e.bits : 0;
  if (bits === 0) return null;
  const userName = e.is_anonymous === true
    ? "Anonymous"
    : typeof e.user_name === "string"
      ? e.user_name
      : "Unknown";
  const net = bits * d.bitsValue;
  return {
    source: "twitch_bits",
    occurredAt: now,
    grossAmount: net,
    netAmount: net,
    currency: d.currency,
    confidence: "estimated",
    public: true,
    description: `Cheer ${bits} bits — ${userName}`,
    externalId: `eventsub:${messageId}`,
  };
}
