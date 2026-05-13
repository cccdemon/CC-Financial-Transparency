# Deploy: financials.raumdock.org

End-to-end runbook for deploying `cc-financial` next to the existing
Server-Tech stack. Targets a Linux host with Docker + Caddy already running.

## 1. DNS

Add to your DNS provider for `raumdock.org`:

```
financials   A      <server-public-ipv4>
financials   AAAA   <server-public-ipv6>   # optional
```

Wait for propagation (`dig +short financials.raumdock.org` should return the
server IP) before touching Caddy — Let's Encrypt cert issuance will fail
otherwise.

## 2. Server prep

Pick a deploy directory (e.g. `/opt/cc-financial`) and clone the repo:

```bash
sudo mkdir -p /opt/cc-financial && sudo chown "$USER" /opt/cc-financial
git clone https://github.com/cccdemon/CC-Financial-Transparency.git /opt/cc-financial
cd /opt/cc-financial
```

## 3. Generate secrets

```bash
# Random session secret
openssl rand -hex 32        # → SESSION_SECRET

# Random overlay token (you'll paste this into OBS Browser Source URLs)
openssl rand -hex 32        # → PUBLIC_OVERLAY_TOKEN

# Strong Postgres password
openssl rand -base64 32     # → POSTGRES_PASSWORD

# Admin password hash (bcrypt)
docker run --rm -i node:20-alpine sh -c 'npm i -s bcryptjs >/dev/null 2>&1 && node -e "console.log(require(\"bcryptjs\").hashSync(process.argv[1], 12))" "your-admin-password"'
```

## 4. .env.production

```bash
cp .env.production.example .env.production
nano .env.production         # paste in the values from step 3
```

Required: `POSTGRES_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`,
`SESSION_SECRET`, `PUBLIC_OVERLAY_TOKEN`. `WEB_HOST_PORT` defaults to **3100**;
change if that port is already taken on the host (it binds to `127.0.0.1` only,
so it won't be publicly reachable directly).

## 5. Start the stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml logs -f web
```

The container entrypoint runs `prisma db push` automatically, creating the
schema on first boot. Look for `schema in sync, launching app` followed by
Next.js's `Ready in <ms>` line.

Sanity check from the host:

```bash
curl -sf http://127.0.0.1:3100/api/public/financial-summary | jq
```

## 6. Wire up Caddy

Append the contents of `Caddyfile.snippet` to your existing `Caddyfile`
(usually `/etc/caddy/Caddyfile`), adjust the upstream address if Caddy itself
runs inside a container that can't reach `127.0.0.1`, then:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy will fetch a Let's Encrypt cert automatically. Verify:

```bash
curl -sfI https://financials.raumdock.org/financial
```

## 7. First admin login

Open `https://financials.raumdock.org/admin/login`, sign in with
`ADMIN_EMAIL` + the plaintext password you hashed in step 3.

## 8. OBS overlay

Browser Source URL pattern:

```
https://financials.raumdock.org/overlay/financial?token=<PUBLIC_OVERLAY_TOKEN>&refresh=30
```

Size: `1920x160` for the compact bar variant.

## Update flow

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`db push` is idempotent — additive schema changes apply on next container
start. **Destructive schema changes** (drop column / drop table) will fail by
design; for those, switch to proper migrations (`prisma migrate dev` locally,
commit `prisma/migrations/`, swap `db push` for `prisma migrate deploy` in
`docker/entrypoint.sh`).

## Backups

```bash
docker exec cc-financial-postgres pg_dump -U cc_financial cc_financial \
  | gzip > "backup-$(date +%F).sql.gz"
```

The `cc_financial_pgdata` volume persists across container rebuilds — only a
`docker volume rm cc_financial_pgdata` loses data.

## Rollback

```bash
git log --oneline -5                    # find a good commit
git checkout <sha>
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

## Ports recap

| Component | Port | Exposure |
|---|---|---|
| Next.js (cc-financial-web) | container 3000 → host `127.0.0.1:3100` | loopback only |
| Postgres (cc-financial-postgres) | 5432 | docker network only |
| Caddy → cc-financial | 443 (public) | public via Let's Encrypt |

No ports leak to the public internet except via Caddy.
