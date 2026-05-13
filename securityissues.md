# Security Issues

Security review of `cc-financial`, focused on authentication, admin actions, public/overlay access, configuration, and dependencies.

## Findings

### High: Login has no brute-force protection

`src/lib/auth.ts` checks a single admin email/password hash, but there is no rate limit, lockout, IP throttling, or audit logging. If `/admin/login` is internet-facing, password guessing is limited only by bcrypt cost and infrastructure.

Recommended fix: add login rate limiting keyed by IP and account identifier, failed-login audit logs, and temporary lockouts or backoff.

### High/Medium: Unvalidated post-login redirect

`src/app/admin/login/page.tsx` redirects to `sp.redirect` and the hidden `redirect` form value without restricting it to internal paths. An attacker can craft a login URL that redirects an already-authenticated user or a newly logged-in user to an external site.

Recommended fix: only allow relative redirects under `/admin`, and fall back to `/admin` for anything else.

### Medium: Admin state-changing actions lack explicit CSRF defense

Admin server actions for creating income, expenses, and giveaways rely on the session cookie only. Logout is also a plain POST route. `SameSite=Lax` reduces exposure, but there is no explicit CSRF token or origin validation for admin mutations.

Recommended fix: validate `Origin`/`Host` for admin POSTs and add CSRF tokens for state-changing forms.

### Medium: Overlay token is passed in the URL query string

`src/app/overlay/financial/page.tsx` accepts `?token=...` and validates it against `PUBLIC_OVERLAY_TOKEN`. URL tokens can leak through logs, browser history, OBS/browser source configuration, screenshots, and referrers.

Recommended fix: use per-overlay random tokens stored hashed, support rotation, and avoid long-lived shared query-string secrets where possible.

### Medium: Weak/default secrets are present locally and not enforced at startup

The local `.env` contains placeholder values such as `SESSION_SECRET="dev-only-change-me"` and `PUBLIC_OVERLAY_TOKEN="dev-overlay-token"`. The auth code checks only whether `SESSION_SECRET` exists, not whether it is strong enough.

Recommended fix: add production startup validation that rejects known placeholder values and requires high-entropy secrets.

### Medium: Docker Postgres exposes default dev credentials on host port 5432

`docker-compose.yml` uses default development database credentials and publishes Postgres as `5432:5432`. This is acceptable for local-only development but risky on shared machines or servers.

Recommended fix: bind Postgres to localhost with `127.0.0.1:5432:5432`, avoid publishing the port when unnecessary, and use non-default credentials outside local development.

### Medium: Known dependency vulnerability from `npm audit`

`npm audit --omit=dev` reports a moderate production vulnerability:

- `postcss <8.5.10`
- Advisory: `GHSA-qx2v-qp2m-jg93`
- Issue: XSS via unescaped `</style>` in CSS stringify output
- Path: bundled through `next` / `node_modules/next/node_modules/postcss`
- Current audit status: no direct fix available

Recommended fix: track and apply a Next.js release that updates its bundled PostCSS dependency, and keep `npm audit` in CI.

### Low/Medium: Public API allows querying any valid month

`src/app/api/public/financial-summary/route.ts` accepts arbitrary `period=YYYY-MM`. If only the current month should be public, this exposes historical financial summaries.

Recommended fix: restrict public periods to the intended range, or document that historical public summaries are intentional.

### Low: No app-level security headers configured

`next.config.ts` does not define security headers such as Content Security Policy, `Referrer-Policy`, `frame-ancestors`/`X-Frame-Options`, `Permissions-Policy`, or HSTS.

Recommended fix: add security headers globally, with a deliberate exception for overlay pages if they must be embedded in OBS or browser sources.

## Positive Notes

- Prisma is used for database access, so the reviewed paths do not show obvious SQL injection.
- React renders user-controlled text through normal JSX escaping, so the reviewed paths do not show obvious direct stored XSS.
- `.env` is ignored by git, and only `.env.example` appears tracked.
