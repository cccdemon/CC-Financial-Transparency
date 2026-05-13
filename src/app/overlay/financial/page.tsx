import { getPublicMonthlySummary } from "@/lib/aggregation";
import { currentMonthPeriod } from "@/lib/period";
import { isOverlayTokenValid } from "@/lib/overlay-token";

export const dynamic = "force-dynamic";

type Search = {
  token?: string;
  theme?: "dark" | "light" | "transparent";
  mode?: "bar" | "panel" | "lower-third" | "scene";
  showTax?: string;
  showGiveaways?: string;
  refresh?: string;
};

export default async function FinancialOverlayPage(props: { searchParams: Promise<Search> }) {
  const sp = await props.searchParams;
  if (!isOverlayTokenValid(sp.token)) {
    return <UnauthorizedOverlay />;
  }

  const period = currentMonthPeriod();
  const summary = await getPublicMonthlySummary(period);
  const refresh = Number.isFinite(Number(sp.refresh)) ? Math.max(5, Number(sp.refresh)) : 30;

  return (
    <>
      <meta httpEquiv="refresh" content={String(refresh)} />
      <div
        style={{
          padding: "1.5rem 2rem",
          display: "flex",
          gap: "2.5rem",
          alignItems: "baseline",
          fontFamily: "system-ui, sans-serif",
          fontWeight: 600,
          fontSize: "2rem",
        }}
      >
        <Metric label="Income" value={summary.income} currency={summary.currency} tone="positive" />
        {sp.showGiveaways !== "false" && (
          <Metric label="Giveaways" value={summary.giveaways} currency={summary.currency} />
        )}
        <Metric
          label="Net"
          value={summary.netResult}
          currency={summary.currency}
          tone={summary.netResult >= 0 ? "positive" : "negative"}
        />
        <span
          style={{
            marginLeft: "auto",
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            opacity: 0.7,
          }}
        >
          {summary.confidence}
        </span>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: number;
  currency: string;
  tone?: "positive" | "negative";
}) {
  const color = tone === "positive" ? "#34d399" : tone === "negative" ? "#fb7185" : undefined;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column" }}>
      <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.8 }}>
        {label}
      </span>
      <span style={{ color, fontVariantNumeric: "tabular-nums" }}>
        {new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value)}
      </span>
    </span>
  );
}

function UnauthorizedOverlay() {
  return null;
}
