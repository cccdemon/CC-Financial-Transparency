# Security Issues

Security review of the current `cc-financial` codebase after the security hardening pass.

## Fixed In This Pass

### Fixed: Login redirect validation

`src/app/admin/login/page.tsx` now passes redirect targets through `safeAdminRedirect()`. Only `/admin` and `/admin/...` paths are accepted; absolute URLs, protocol-relative URLs, non-admin paths, backslash/newline payloads, and empty values fall back to `/admin`.

### Fixed: Basic login throttling

Login attempts are now rate-limited in memory by IP/email key via `src/lib/security.ts`. This is suitable as an application-level baseline, but production should still use reverse-proxy or platform-level rate limiting because in-memory counters reset on restart and do not coordinate across instances.

### Fixed: Same-origin checks for admin mutations

State-changing admin actions and POST routes now call `assertSameOriginRequest()` before mutating data. This covers the main server actions/routes for:

- login
- income create/edit/delete
- expense create/edit/delete
- giveaway create/edit/delete
- recurring expense create/edit/delete
- Twitch payment import
- Twitch disconnect
- EventSub registration
- logout

### Fixed: CSV formula injection in profit/loss export

`src/app/api/admin/profit-loss.csv/route.ts` now uses `csvSafeCell()` from `src/lib/security.ts`, which neutralizes spreadsheet formula-like values beginning with `=`, `+`, `-`, `@`, tab, or carriage return.

### Fixed: Twitch payment importer size limits

The client and server now enforce limits for Twitch payment imports:

- client-side file size limit
- client-side row count limit
- server-side submitted CSV length limit
- server-side parsed row count limit

### Fixed: Baseline security headers

`next.config.ts` now sets baseline headers:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- HSTS
- CSP and `X-Frame-Options: DENY` outside overlay routes
- `X-Robots-Tag: noindex` on overlay routes

Overlay routes intentionally do not receive `X-Frame-Options: DENY` because they are meant to be embedded in OBS/browser sources.

### Fixed: Production placeholder-secret rejection

`src/lib/security.ts` now rejects short and known-placeholder production secrets. The checks are used by session signing, overlay token validation, Twitch OAuth state signing, and Twitch EventSub secret validation.

### Fixed: Local Postgres host binding

`docker-compose.yml` now binds the development Postgres port to `127.0.0.1:5432:5432` instead of all host interfaces.

## Remaining Findings

### Medium: Public expense descriptions can still leak sensitive data

Public pages expose descriptions for expense rows and recurring expense rules that are marked public. This is now an intentional product feature, but it remains a data governance risk.

Impact: invoice numbers, vendor details, account references, or other sensitive text entered into a public row can become visible.

Recommended fix: add separate `publicDescription` fields for expenses and recurring expenses, keep private/admin descriptions separate, and render only `publicDescription` on public pages.

### Medium: Overlay token is still passed in the URL query string

`src/app/overlay/financial/page.tsx` accepts `?token=...` and validates it against `PUBLIC_OVERLAY_TOKEN`.

Impact: URL tokens can leak through logs, browser history, OBS/browser-source configuration, screenshots, referrers, and shared scene collections.

Recommended fix: use per-overlay random tokens stored hashed, support rotation, and avoid long-lived shared query-string secrets where possible.

### Medium: Known dependency vulnerability from `npm audit`

`npm audit --omit=dev` reports a moderate production vulnerability:

- `postcss <8.5.10`
- Advisory: `GHSA-qx2v-qp2m-jg93`
- Issue: XSS via unescaped `</style>` in CSS stringify output
- Path: bundled through `next` / `node_modules/next/node_modules/postcss`
- Current audit status: no direct fix available

Recommended fix: track and apply the Next.js release that updates its bundled PostCSS dependency, and keep production dependency audit in CI.

### Low/Medium: Public API and pages expose arbitrary historical public periods

`src/app/api/public/financial-summary/route.ts` accepts arbitrary `period=YYYY-MM`. Public `/financial/year` also exposes yearly public summaries.

Impact: if historical public financial data should not be broadly queryable, this exposes more information than intended.

Recommended fix: document that historical public transparency is intentional, or restrict public periods to an explicit configured range.

### Low/Medium: Admin profit/loss export exposes full private ledger to any admin session

`/admin/profit-loss` and `/api/admin/profit-loss.csv` include all admin ledger rows, including private rows and descriptions. This is intended for the owner, but there is no role separation.

Impact: if a future second admin/user role is added, it would receive full private financial/export access by default.

Recommended fix: document this as owner-only, or add role-based authorization before adding multi-user access.

### Low: Twitch OAuth and admin error messages can expose upstream details

Some Twitch admin flows include raw upstream error messages in query strings and render them on `/admin/twitch`.

Impact: this can expose provider error details, configuration hints, or overly long messages to the admin UI/logs.

Recommended fix: log detailed errors server-side and show short stable error codes/messages in the UI.

## Positive Notes

- Prisma is used for database access; reviewed paths do not show obvious SQL injection.
- React renders user-controlled text through normal JSX escaping; reviewed paths do not show obvious direct stored XSS.
- Twitch EventSub webhook verifies signatures and timestamp freshness before processing notifications.
- Edit-page and login redirects now use safe admin-only redirect handling.
- `.env` is ignored by git, and only `.env.example` appears tracked.
