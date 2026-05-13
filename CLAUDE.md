# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# cc-financial: Twitch Financial Transparency Service

## Current State

Phase 1 scaffold + Phase 2 manual ledger skeleton landed. The stack is:

- **Next.js 16 (App Router) + TypeScript + Tailwind v4** — code under [src/app](src/app/), shared libs under [src/lib](src/lib/).
- **Prisma 6 + PostgreSQL** — schema in [prisma/schema.prisma](prisma/schema.prisma) covers all spec tables (income / expense / giveaway / monthly_reviews / twitch_event_log / settings / overlay_configs / tax_profiles / tax_tariffs / tax_forecasts).
- **Vitest** for unit tests. The § 32a EStG 2026 tariff function in [src/lib/tax](src/lib/tax/) has full coverage of zones 1–5 + Ehegatten-Splitting + the stream-tax-share marginal calculation.
- **docker-compose.yml** at the repo root runs the local Postgres.
- Admin auth: single-admin cookie session signed with `SESSION_SECRET`, credentials from `ADMIN_EMAIL` + bcrypt `ADMIN_PASSWORD_HASH`. The middleware in [src/middleware.ts](src/middleware.ts) gates `/admin/*` on cookie presence only — every admin server component must still call `getAdminSession()` to re-verify (the middleware runs under Edge runtime and cannot use Node crypto).

Phases not yet started: Twitch EventSub integration, monthly review workflow, CSV export, full tax forecast UI.

**Deployment artifacts** (target: `financials.raumdock.org`, behind existing Caddy):

- [Dockerfile](Dockerfile) — multi-stage, Next.js standalone output, runs as non-root
- [docker-compose.prod.yml](docker-compose.prod.yml) — web + dedicated Postgres, web bound to `127.0.0.1:3100` (loopback only)
- [docker/entrypoint.sh](docker/entrypoint.sh) — runs `prisma db push` on boot (no migration history yet; see DEPLOY.md for when to graduate to `migrate deploy`)
- [Caddyfile.snippet](Caddyfile.snippet) — site block to append to the host's existing Caddyfile
- [.env.production.example](.env.production.example) — required env vars for prod compose
- [DEPLOY.md](DEPLOY.md) — full runbook (DNS → secrets → up → Caddy reload → first login)

> Next 16 renamed `middleware.ts` → `proxy.ts`. Migration is optional but warned on build.

## Commands

```bash
docker compose up -d postgres   # start local Postgres
npm run dev                     # dev server on :3000
npm run build                   # production build + type-check
npm run lint
npm test                        # vitest run (one-shot)
npm run test:watch              # vitest watch
npm run db:migrate              # prisma migrate dev (apply + generate)
npm run db:generate             # prisma generate (after schema change)
npm run db:studio               # prisma studio
```

Generate the admin password hash:

```bash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" 'your-password'
```

## Goal

Build a service for the Twitch channel `JustCallMeDeimos` that gathers Twitch monetization signals and manually entered financial records, then publishes a viewer-friendly transparency dashboard on `raumdock.org`.

The public site should show how much money the stream makes, how much is self-funded, and how much is spent on giveaways or other stream costs.

## Important Constraint

Twitch does not provide one complete public API for final creator payout totals, final ad revenue, taxes, refunds, chargebacks, or complete net revenue. Treat Twitch API/EventSub data as financial signals. Final payout and ad revenue numbers must be entered manually or imported from exports if available.

The product must distinguish:

- `actual`: manually confirmed payout or reviewed ledger amount
- `estimated`: calculated from Twitch events
- `unverified`: captured automatically but not reviewed

## Product Surfaces

### Public Website

Target domain: `raumdock.org`

Recommended public routes:

- `/financial`
- `/financial/month/[yyyy-mm]`
- `/financial/giveaways`
- `/overlay/financial`
- `/overlay/giveaways`
- `/overlay/tax-reserve`

Public dashboard should show:

- current month income
- current month giveaway cost
- current month operating cost, if tracked
- current month estimated net result
- monthly trend chart
- source breakdown:
  - subscriptions
  - gift subscriptions
  - resubscriptions
  - Bits / cheers
  - ads, manual
  - payouts, manual
  - other manual income
- giveaway list with value and funding type
- clear labels for estimated vs confirmed values

Do not expose private viewer data, payout documents, winner personal data, or Twitch tokens.

### OBS Overlay

Add stream overlays designed for OBS Browser Source.

Recommended overlay routes:

- `/overlay/financial`
- `/overlay/financial/compact`
- `/overlay/giveaways`
- `/overlay/tax-reserve`
- `/overlay/month-goal`

These pages must be usable directly as OBS Browser Sources.

Default OBS source sizes:

- compact bar: `1920x160`
- side panel: `420x1080`
- lower third: `900x220`
- full stats scene: `1920x1080`

Overlay pages should:

- have transparent backgrounds by default
- avoid scrollbars
- avoid login prompts
- avoid admin/private data
- use public-safe aggregate data only
- refresh automatically
- be readable over gameplay/video
- work without mouse interaction
- support query parameters for layout and theme

Example OBS URLs:

```txt
https://raumdock.org/overlay/financial?token=PUBLIC_OVERLAY_TOKEN&theme=dark&mode=bar
https://raumdock.org/overlay/giveaways?token=PUBLIC_OVERLAY_TOKEN&theme=dark&limit=3
https://raumdock.org/overlay/tax-reserve?token=PUBLIC_OVERLAY_TOKEN&theme=dark
```

Use a separate public overlay token, not the admin session. The token can be low-risk but should prevent random indexing or casual scraping.

Supported query parameters:

- `token`
- `theme`
  - `dark`
  - `light`
  - `transparent`
- `mode`
  - `bar`
  - `panel`
  - `lower-third`
  - `scene`
- `period`
  - `current-month`
  - `year-to-date`
  - `last-stream`, later
- `showTax`
  - `true`
  - `false`
- `showGiveaways`
  - `true`
  - `false`
- `refresh`
  - seconds between API refreshes

The overlay must never show:

- raw Twitch event payloads
- individual payout records
- private tax profile assumptions
- non-stream taxable income
- viewer personal data
- giveaway winner personal data
- admin controls

### Admin Dashboard

Private routes under `/admin`.

Admin features:

- sign in
- add/edit manual income entries
- add/edit expenses
- add/edit self-financed giveaways
- mark Twitch-captured events as reviewed
- override estimated values
- lock reviewed months
- hide individual entries from public display
- export ledger as CSV or JSON
- configure OBS overlays
- preview OBS overlay layouts
- rotate overlay token

### Twitch Collector

Use Twitch OAuth for `JustCallMeDeimos`.

Collect near-real-time events with Twitch EventSub:

- `channel.subscribe`
- `channel.subscription.gift`
- `channel.subscription.message`
- `channel.cheer`
- `channel.bits.use`
- optional:
  - `channel.hype_train.begin`
  - `channel.hype_train.progress`
  - `channel.hype_train.end`

Use Twitch API snapshots where available:

- broadcaster subscriptions
- Bits leaderboard
- creator goals, if useful

Do not depend on Twitch API for complete final revenue accounting.

## Recommended Stack

Use a boring, deployable web app:

- Next.js with TypeScript
- PostgreSQL
- Prisma or Drizzle ORM
- Docker Compose for deployment
- Server-side rendered public dashboard
- API routes for EventSub webhooks and admin mutations

If the existing `raumdock.org` deployment stack uses something else, prefer matching that stack over introducing unnecessary infrastructure.

## Environment Variables

Use names like:

```env
DATABASE_URL=
ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=
SESSION_SECRET=

TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_BROADCASTER_ID=
TWITCH_BROADCASTER_LOGIN=JustCallMeDeimos
TWITCH_EVENTSUB_SECRET=
TWITCH_REDIRECT_URI=https://raumdock.org/api/twitch/oauth/callback

PUBLIC_BASE_URL=https://raumdock.org
PUBLIC_OVERLAY_TOKEN=
```

Never commit real secrets.

## Data Model

### Core Tables

#### `income_events`

Fields:

- `id`
- `source`
  - `twitch_sub`
  - `twitch_resub`
  - `twitch_gift_sub`
  - `twitch_bits`
  - `twitch_hype_train`
  - `manual_twitch_payout`
  - `manual_ad_revenue`
  - `manual_sponsor`
  - `manual_other`
- `occurred_at`
- `gross_amount`
- `net_amount`
- `currency`
- `confidence`
  - `actual`
  - `estimated`
  - `unverified`
- `public`
- `description`
- `external_id`
- `raw_payload`
- `created_at`
- `updated_at`

#### `expense_events`

Fields:

- `id`
- `source`
  - `giveaway`
  - `hardware`
  - `software`
  - `hosting`
  - `fees`
  - `manual_other`
- `occurred_at`
- `amount`
- `currency`
- `public`
- `description`
- `receipt_url`
- `created_at`
- `updated_at`

#### `giveaways`

Fields:

- `id`
- `title`
- `occurred_at`
- `item_name`
- `estimated_value`
- `actual_cost`
- `currency`
- `funding_type`
  - `self`
  - `community`
  - `sponsor`
  - `mixed`
- `public`
- `public_note`
- `private_note`
- `expense_event_id`
- `created_at`
- `updated_at`

When a self-financed giveaway is created, create a linked `expense_events` row with `source = giveaway`.

#### `monthly_reviews`

Fields:

- `id`
- `month`
- `status`
  - `open`
  - `reviewed`
  - `locked`
- `reviewed_at`
- `reviewed_by`
- `notes`
- `created_at`
- `updated_at`

Locked months should not be editable unless explicitly unlocked.

#### `twitch_event_log`

Fields:

- `id`
- `eventsub_message_id`
- `event_type`
- `event_version`
- `occurred_at`
- `processed_at`
- `status`
  - `processed`
  - `ignored`
  - `failed`
- `raw_payload`
- `error`

Use this table for idempotency and debugging.

#### `settings`

Fields:

- `key`
- `value`
- `updated_at`

Possible settings:

- estimated Tier 1 net revenue
- estimated Tier 2 net revenue
- estimated Tier 3 net revenue
- estimated Prime net revenue
- estimated Bits conversion
- default public visibility
- public overlay token hash
- overlay refresh interval
- overlay default theme

#### `overlay_configs`

Fields:

- `id`
- `name`
- `slug`
- `enabled`
- `theme`
  - `dark`
  - `light`
  - `transparent`
- `mode`
  - `bar`
  - `panel`
  - `lower-third`
  - `scene`
- `period`
  - `current-month`
  - `year-to-date`
- `show_income`
- `show_expenses`
- `show_giveaways`
- `show_tax_reserve`
- `show_net_result`
- `refresh_seconds`
- `public_token_hash`
- `created_at`
- `updated_at`

## Estimation Rules

Start with configurable estimates, not hardcoded business assumptions.

Examples:

- Bits: estimate from bit count using a configurable value per bit.
- Subscriptions: estimate using configurable tier values.
- Gift subs: estimate using tier and gift count.
- Hype Train: do not double-count if underlying Bits/sub events are also captured. Store Hype Train metadata separately or mark as informational unless a clear financial event is missing.

Every auto-created financial row must show whether it is estimated or unverified.

## Twitch EventSub Webhook Requirements

Implement:

- signature validation
- challenge handling
- idempotency using `eventsub_message_id`
- raw payload storage
- retry-safe processing
- event type mapping to ledger rows

Endpoints:

- `POST /api/twitch/eventsub`
- `GET /api/twitch/oauth/start`
- `GET /api/twitch/oauth/callback`
- `POST /api/admin/twitch/eventsub/register`

Required Twitch scopes are likely:

- `channel:read:subscriptions`
- `bits:read`
- `channel:read:hype_train`, if Hype Train is used

Request only scopes actually needed.

## Public Aggregation Rules

Public totals should be based on rows where `public = true`.

Monthly result:

```txt
income_total = sum(public income net_amount if available else gross_amount)
expense_total = sum(public expenses amount)
net_result = income_total - expense_total
```

Show labels:

- “confirmed” when all rows in the period are actual/reviewed
- “estimated” when at least one row is estimated
- “unreviewed” when at least one row is unverified

Overlay aggregation should use the same public aggregation service as the public dashboard, but with a smaller response shape optimized for live display.

Recommended API endpoint:

- `GET /api/public/financial-summary`

Query parameters:

- `period`
- `token`

Response shape:

```json
{
  "period": "2026-05",
  "income": 123.45,
  "expenses": 67.89,
  "giveaways": 50,
  "taxReserve": 22.5,
  "netBeforeTax": 55.56,
  "netAfterTax": 33.06,
  "currency": "EUR",
  "confidence": "estimated",
  "updatedAt": "2026-05-12T12:00:00.000Z"
}
```

## Suggested UI

Keep the page practical and transparent.

Public dashboard:

- compact monthly cards:
  - Income
  - Giveaways
  - Costs
  - Net
- source breakdown table
- monthly line/bar chart
- giveaway history table
- small note explaining estimates
- optional tax reserve estimate, clearly marked as prediction

Admin dashboard:

- ledger table with filters
- manual income form
- expense form
- giveaway form
- monthly review controls
- Twitch connection status
- tax assumption settings
- tax forecast preview
- overlay configuration preview
- generated OBS Browser Source URLs
- overlay token rotation

OBS overlay:

- no cards inside cards
- stable fixed dimensions for Browser Source
- transparent-safe text rendering
- high contrast text with subtle shadow/stroke
- avoid tiny labels
- avoid paragraphs
- avoid layout shift when values change
- use tabular numbers
- show last updated time only if configured
- provide animated value transitions only if they do not distract on stream

Suggested overlay variants:

- compact bar:
  - Income
  - Giveaways
  - Tax Reserve
  - After Tax
- side panel:
  - current month totals
  - latest giveaways
  - reviewed/estimated badge
- lower third:
  - one rotating metric every 10-15 seconds
- full stats scene:
  - larger monthly dashboard for Just Chatting/intermission scenes

## MVP Implementation Plan

### Phase 1: Local App Skeleton

- Create Next.js TypeScript app.
- Add PostgreSQL connection.
- Add ORM schema and migrations.
- Add seed data for local development.
- Add basic layout and public `/financial` page.

### Phase 2: Manual Ledger

- Build admin login.
- Build CRUD for income events.
- Build CRUD for expense events.
- Build giveaway CRUD.
- Automatically link self-financed giveaways to expenses.
- Build public monthly aggregation.
- Add tax prediction settings and reserve calculation.
- Add OBS overlay routes using public aggregate data.
- Add admin overlay preview and token rotation.

### Phase 3: Twitch Integration

- Add Twitch OAuth flow.
- Store refresh token securely.
- Add EventSub webhook endpoint.
- Validate Twitch webhook signatures.
- Register selected EventSub subscriptions.
- Map Twitch events into `income_events`.
- Store raw events in `twitch_event_log`.

### Phase 4: Review Workflow

- Add monthly review page.
- Allow conversion of estimated/unverified rows to actual.
- Allow manual overrides.
- Add monthly lock/unlock.
- Add CSV export.

### Phase 5: Deployment

- Add Dockerfile.
- Add `docker-compose.yml`.
- Add production environment variable docs.
- Deploy behind HTTPS on `raumdock.org`.
- Verify EventSub callback works from Twitch.

## Acceptance Criteria

The MVP is complete when:

- `/financial` publicly shows monthly income, expenses, giveaways, and net result.
- Admin can add manual payout/ad/giveaway numbers.
- Self-financed giveaways reduce public net result.
- Admin can configure German tax prediction assumptions.
- Public dashboard can show an optional estimated tax reserve.
- OBS Browser Source overlay can show public-safe monthly financial data.
- Overlay access works with a separate public overlay token.
- Twitch EventSub events are received, validated, stored, and converted to estimated ledger rows.
- Duplicate EventSub messages do not create duplicate financial rows.
- Private data is not visible publicly.
- A month can be reviewed and locked.

## Initial Claude Code Task

Start with Phase 1 and Phase 2.

Create a Next.js TypeScript app in this directory with:

- PostgreSQL-ready ORM schema
- public `/financial` page
- admin login
- manual income form
- manual expense form
- giveaway form
- monthly aggregation logic
- German tax prediction module with configurable assumptions
- OBS overlay routes and public summary API

Do not implement Twitch integration until the manual ledger and public dashboard are working.

## OBS Overlay Implementation Notes

Use frontend routes that render cleanly in OBS Browser Source.

Recommended implementation:

- `/overlay/financial`
  - reads query params
  - validates overlay token against stored hash
  - fetches `/api/public/financial-summary`
  - renders transparent overlay
  - refreshes on interval
- `/api/public/financial-summary`
  - returns public-safe aggregate data only
  - requires valid overlay token unless explicitly configured public
  - caches briefly, for example 5-30 seconds

Avoid WebSockets for MVP. Polling every 15-60 seconds is enough for financial data. Add Server-Sent Events later if live Twitch reactions are needed.

### Overlay Security

Overlay tokens are not admin credentials. Still:

- store only token hashes
- allow rotating tokens
- do not log full token values
- set `X-Robots-Tag: noindex`
- add `robots.txt` disallow for `/overlay`
- do not include admin bundles/components on overlay routes

### OBS Styling Requirements

CSS requirements:

- `background: transparent`
- fixed minimum layout dimensions per mode
- `font-variant-numeric: tabular-nums`
- strong text contrast
- no scrollbars
- responsive only within intended OBS source dimensions
- do not depend on browser focus

Add a local preview page:

- `/admin/overlays`

Admin overlay page should show:

- generated OBS URLs
- token rotate button
- iframe preview for each overlay mode
- toggles for which metrics appear
- theme selector
- refresh interval setting

### Overlay Testing

Add basic tests or manual verification notes:

- overlay renders without admin session when token is valid
- overlay returns unauthorized or empty when token is invalid
- overlay does not expose private tax assumptions
- overlay does not show scrollbars at `1920x160`, `420x1080`, `900x220`, and `1920x1080`
- values update after new ledger entries are added

## German Tax Prediction Module

Add a tax prediction feature for Germany. This must be presented as a planning estimate, not tax advice and not a substitute for a Steuerberater or official tax filing.

The tax module should estimate how much money should be reserved from stream profit for German taxes.

### Tax Sources To Track

Use official references when implementing or updating formulas:

- Einkommensteuer tariff, § 32a EStG:
  - https://www.gesetze-im-internet.de/estg/__32a.html
  - https://esth.bundesfinanzministerium.de/lsth/2026/A-Einkommensteuergesetz/IV-Tarif-31-34b/Paragraf-32a/inhalt.html
- Kleinunternehmerregelung, § 19 UStG:
  - https://www.gesetze-im-internet.de/ustg_1980/__19.html

For tax year 2026, § 32a EStG currently uses:

- up to `12,348 EUR`: income tax `0`
- `12,349 EUR` to `17,799 EUR`: `(914.51 * y + 1,400) * y`
- `17,800 EUR` to `69,878 EUR`: `(173.10 * z + 2,397) * z + 1,034.87`
- `69,879 EUR` to `277,825 EUR`: `0.42 * x - 11,135.63`
- from `277,826 EUR`: `0.45 * x - 19,470.38`

Where:

- `x` is taxable income rounded down to full EUR
- `y` is one ten-thousandth of the part above `12,348 EUR`
- `z` is one ten-thousandth of the part above `17,799 EUR`

Keep these values in a versioned config table, not hardcoded in random UI code.

### Scope

The tax prediction should support:

- annual projected stream profit
- monthly tax reserve
- year-to-date tax reserve
- marginal income tax estimate
- optional solidarity surcharge placeholder
- optional church tax placeholder
- VAT / Umsatzsteuer status warning
- configurable other income outside the stream
- configurable deductible private allowances or tax advisor adjustments

### Important Assumptions

German income tax is calculated on total taxable income, not just Twitch income. Therefore the admin must be able to enter:

- expected non-stream taxable income
- spouse/joint assessment toggle
- already paid wage tax / prepayments
- health insurance / pension / other deductible estimates
- church tax enabled/disabled
- federal state for church tax rate, if enabled
- Kleinunternehmer status

The public website should not expose private tax assumptions unless explicitly marked public.

### Data Model Additions

#### `tax_profiles`

Fields:

- `id`
- `tax_year`
- `country`
  - default `DE`
- `filing_type`
  - `single`
  - `joint`
- `federal_state`
- `church_tax_enabled`
- `church_tax_rate`
- `solidarity_surcharge_enabled`
- `non_stream_taxable_income`
- `deductible_expense_estimate`
- `already_paid_tax`
- `vat_mode`
  - `kleinunternehmer`
  - `regular_vat`
  - `unknown`
- `public_tax_reserve_enabled`
- `created_at`
- `updated_at`

#### `tax_tariffs`

Fields:

- `id`
- `tax_year`
- `country`
- `tariff_json`
- `source_url`
- `source_checked_at`
- `created_at`
- `updated_at`

Store the German § 32a tariff as structured JSON, for example:

```json
{
  "year": 2026,
  "currency": "EUR",
  "basic_allowance": 12348,
  "zones": [
    {
      "from": 0,
      "to": 12348,
      "formula": "0"
    },
    {
      "from": 12349,
      "to": 17799,
      "formula": "(914.51 * y + 1400) * y",
      "y_base": 12348
    },
    {
      "from": 17800,
      "to": 69878,
      "formula": "(173.10 * z + 2397) * z + 1034.87",
      "z_base": 17799
    },
    {
      "from": 69879,
      "to": 277825,
      "formula": "0.42 * x - 11135.63"
    },
    {
      "from": 277826,
      "to": null,
      "formula": "0.45 * x - 19470.38"
    }
  ]
}
```

#### `tax_forecasts`

Fields:

- `id`
- `tax_year`
- `period`
- `stream_income`
- `stream_expenses`
- `stream_profit`
- `projected_annual_stream_profit`
- `other_taxable_income`
- `estimated_taxable_income`
- `estimated_income_tax_total`
- `estimated_stream_tax_share`
- `estimated_solidarity_surcharge`
- `estimated_church_tax`
- `estimated_total_tax_reserve`
- `already_reserved`
- `recommended_additional_reserve`
- `confidence`
  - `rough`
  - `configured`
  - `reviewed`
- `created_at`
- `updated_at`

### Calculation Rules

Use this rough model for the first implementation:

```txt
stream_profit = public_or_admin_income - deductible_stream_expenses
projected_annual_stream_profit = year_to_date_stream_profit / elapsed_months * 12
estimated_taxable_income =
  projected_annual_stream_profit
  + non_stream_taxable_income
  - deductible_expense_estimate
```

For `filing_type = joint`, approximate splitting by:

```txt
joint_tax = income_tax(taxable_income / 2) * 2
```

Estimate the stream share of income tax:

```txt
tax_without_stream = income_tax(non_stream_taxable_income - deductible_expense_estimate)
tax_with_stream = income_tax(estimated_taxable_income)
estimated_stream_tax_share = max(0, tax_with_stream - tax_without_stream)
```

This gives a better reserve estimate than multiplying stream profit by an average tax rate.

### VAT / Umsatzsteuer Handling

Add a VAT status warning, not a full VAT filing system.

For current § 19 UStG Kleinunternehmer rules, the app should track:

- previous calendar year relevant turnover
- current calendar year relevant turnover
- threshold warning when previous year is above `25,000 EUR`
- threshold warning when current year approaches `100,000 EUR`

If `vat_mode = kleinunternehmer`, show:

- no VAT collected in the estimate
- warning if thresholds are exceeded or near exceeded

If `vat_mode = regular_vat`, show:

- placeholder for VAT liability
- note that Twitch/foreign-platform VAT treatment may need professional review

Do not attempt complex cross-border platform VAT logic in the MVP.

### Public Tax Display

If enabled, public dashboard may show:

- estimated tax reserve
- estimated after-tax stream result
- label: `Tax prediction, not final tax assessment`

Recommended public formula:

```txt
after_tax_estimate = stream_profit - estimated_total_tax_reserve
```

Do not show:

- non-stream income
- spouse/joint assumptions
- already paid tax
- private deduction assumptions
- exact tax profile details

### Admin Tax UI

Admin should include:

- tax year selector
- filing type selector
- other taxable income input
- deductible estimate input
- church tax toggle
- federal state selector
- VAT mode selector
- Kleinunternehmer threshold inputs
- public tax reserve toggle
- preview of:
  - projected stream profit
  - estimated taxable income
  - estimated income tax
  - estimated stream tax share
  - recommended monthly reserve

### Testing

Add unit tests for the § 32a EStG income tax function.

Test at minimum:

- income below `12,348 EUR` returns `0`
- boundary at `12,348 EUR`
- first progression zone
- second progression zone
- `42%` zone
- `45%` zone
- joint splitting calculation
- stream tax share cannot be negative
