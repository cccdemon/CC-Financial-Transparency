import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { assertSameOriginRequest } from "@/lib/security";
import { getStoredTokens, clearTokens, listEventSubSubscriptions } from "@/lib/twitch";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TwitchAdminPage({ searchParams }: PageProps) {
  if (!(await getAdminSession())) redirect("/admin/login");
  const sp = await searchParams;

  const tokens = await getStoredTokens();
  const broadcasterId = process.env.TWITCH_BROADCASTER_ID ?? null;
  const broadcasterLogin = process.env.TWITCH_BROADCASTER_LOGIN ?? null;

  let subscriptions: Awaited<ReturnType<typeof listEventSubSubscriptions>> | null = null;
  let listError: string | null = null;
  if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
    try {
      subscriptions = await listEventSubSubscriptions();
    } catch (e) {
      listError = e instanceof Error ? e.message : "unknown";
    }
  }

  const recentEvents = await db.twitchEventLog.findMany({
    orderBy: { occurredAt: "desc" },
    take: 10,
  });

  async function disconnect() {
    "use server";
    await assertSameOriginRequest();
    if (!(await getAdminSession())) redirect("/admin/login");
    await clearTokens();
    redirect("/admin/twitch?disconnected=1");
  }

  const connected = Boolean(tokens?.accessToken);
  const expiresAt = tokens?.expiresAt ? new Date(tokens.expiresAt) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Twitch integration</h1>

      {sp.error && (
        <p className="rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          Error: {String(sp.error)}
        </p>
      )}
      {sp.connected && (
        <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          Connected to Twitch.
        </p>
      )}
      {sp.disconnected && (
        <p className="rounded border border-neutral-200 bg-neutral-50 p-2 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          Twitch tokens cleared.
        </p>
      )}
      {sp.created !== undefined && (
        <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          Created: {String(sp.created) || "(none)"} · Skipped: {String(sp.skipped) || "(none)"}
        </p>
      )}

      <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 font-medium">Connection</h2>
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-neutral-500">Broadcaster</dt>
          <dd className="tabular-nums">{broadcasterLogin ?? "—"} {broadcasterId ? `(${broadcasterId})` : ""}</dd>
          <dt className="text-neutral-500">Status</dt>
          <dd>{connected ? "Connected" : "Not connected"}</dd>
          {connected && (
            <>
              <dt className="text-neutral-500">User</dt>
              <dd>{tokens?.userLogin ?? "—"} {tokens?.userId ? `(${tokens.userId})` : ""}</dd>
              <dt className="text-neutral-500">Scopes</dt>
              <dd className="break-all">{tokens?.scopes.join(" ") || "—"}</dd>
              <dt className="text-neutral-500">Token expires</dt>
              <dd className="tabular-nums">{expiresAt?.toLocaleString() ?? "—"}</dd>
            </>
          )}
        </dl>
        <div className="mt-3 flex gap-2">
          <a
            href="/api/twitch/oauth/start"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            {connected ? "Reconnect" : "Connect to Twitch"}
          </a>
          {connected && (
            <form action={disconnect}>
              <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
                Disconnect
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 font-medium">EventSub subscriptions</h2>
        {listError && (
          <p className="text-sm text-rose-600">List failed: {listError}</p>
        )}
        {subscriptions && subscriptions.length === 0 && (
          <p className="text-sm text-neutral-500">No EventSub subscriptions registered.</p>
        )}
        {subscriptions && subscriptions.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1">Type</th>
                <th className="py-1">Version</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-1">{s.type}</td>
                  <td className="py-1">{s.version}</td>
                  <td className="py-1">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form action="/api/admin/twitch/eventsub/register" method="post" className="mt-3">
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
            Register missing subscriptions
          </button>
        </form>
        <p className="mt-2 text-xs text-neutral-500">
          Webhook URL: <code>{process.env.PUBLIC_BASE_URL ?? "(PUBLIC_BASE_URL not set)"}/api/twitch/eventsub</code>
        </p>
      </section>

      <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 font-medium">Recent events</h2>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-neutral-500">No events received yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1">Occurred</th>
                <th className="py-1">Type</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-1 tabular-nums">{e.occurredAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td className="py-1">{e.eventType}</td>
                  <td className="py-1">{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
