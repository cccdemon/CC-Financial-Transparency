import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyEventSubSignature } from "@/lib/twitch";
import { mapEventToIncome, type TwitchEventEnvelope } from "@/lib/twitch-mapping";

const HEADER_MESSAGE_ID = "twitch-eventsub-message-id";
const HEADER_MESSAGE_TS = "twitch-eventsub-message-timestamp";
const HEADER_MESSAGE_SIG = "twitch-eventsub-message-signature";
const HEADER_MESSAGE_TYPE = "twitch-eventsub-message-type";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const messageId = req.headers.get(HEADER_MESSAGE_ID);
  const timestamp = req.headers.get(HEADER_MESSAGE_TS);
  const signature = req.headers.get(HEADER_MESSAGE_SIG);
  const messageType = req.headers.get(HEADER_MESSAGE_TYPE);

  if (!verifyEventSubSignature({ messageId, timestamp, signature }, rawBody)) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  let body: {
    challenge?: string;
    subscription?: { type: string; status?: string; version?: string };
    event?: Record<string, unknown>;
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  if (messageType === "webhook_callback_verification") {
    return new NextResponse(body.challenge ?? "", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  if (messageType === "revocation") {
    await safeLog(messageId!, timestamp!, body, "ignored");
    return new NextResponse("ok", { status: 204 });
  }

  if (messageType !== "notification") {
    return new NextResponse("ignored", { status: 204 });
  }

  if (!body.subscription || !body.event) {
    return new NextResponse("bad payload", { status: 400 });
  }

  const dedupe = await safeLog(messageId!, timestamp!, body, "processed");
  if (dedupe === "duplicate") {
    return new NextResponse("duplicate", { status: 204 });
  }

  try {
    const envelope: TwitchEventEnvelope = {
      subscription: { type: body.subscription.type },
      event: body.event,
    };
    const mapped = mapEventToIncome(envelope, messageId!, new Date(timestamp!));
    if (mapped) {
      await db.incomeEvent.upsert({
        where: { externalId: mapped.externalId },
        create: {
          source: mapped.source,
          occurredAt: mapped.occurredAt,
          grossAmount: mapped.grossAmount,
          netAmount: mapped.netAmount,
          currency: mapped.currency,
          confidence: mapped.confidence,
          public: mapped.public,
          description: mapped.description,
          externalId: mapped.externalId,
          rawPayload: body as unknown as Prisma.InputJsonValue,
        },
        update: {},
      });
    }
  } catch (e) {
    await db.twitchEventLog.update({
      where: { eventsubMessageId: messageId! },
      data: {
        status: "failed",
        error: e instanceof Error ? e.message : "unknown",
      },
    });
    return new NextResponse("processing error", { status: 500 });
  }

  return new NextResponse("ok", { status: 204 });
}

async function safeLog(
  messageId: string,
  timestamp: string,
  body: {
    subscription?: { type?: string; version?: string };
    event?: Record<string, unknown>;
  },
  status: "processed" | "ignored",
): Promise<"new" | "duplicate"> {
  try {
    await db.twitchEventLog.create({
      data: {
        eventsubMessageId: messageId,
        eventType: body.subscription?.type ?? "unknown",
        eventVersion: body.subscription?.version ?? "unknown",
        occurredAt: new Date(timestamp),
        processedAt: new Date(),
        status,
        rawPayload: body as unknown as Prisma.InputJsonValue,
      },
    });
    return "new";
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return "duplicate";
    }
    throw e;
  }
}
