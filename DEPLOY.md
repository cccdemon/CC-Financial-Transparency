# Deploy: financial.raumdock.org

End-to-end runbook for deploying `cc-financial` next to the existing
Server-Tech stack. Targets the `10.10.10.99` LXC behind your front-edge
nginx SNI router.

## Topology

```
internet
  └─ front-edge nginx :443     (SNI passthrough, ssl_preread on)
       └─ 10.10.10.99:3100     (this LXC, this stack)
            └─ caddy:3100      (terminates TLS — Let's Encrypt TLS-ALPN-01)
                 └─ web:3000   (Next.js, docker network only)
                      └─ postgres:5432 (docker network only)
```

The front-edge does **not** terminate TLS for this hostname. The Caddy
container in this stack does, using **TLS-ALPN-01 only** (port 80 is not
routed to us, so HTTP-01 is intentionally disabled).

## 1. Front-edge nginx

Already configured per the existing pattern — confirm the stream map has:

```nginx
map $ssl_preread_server_name $upstream_backend {
    financial.raumdock.org financial_lxc;
}

upstream financial_lxc {
    server 10.10.10.99:3100;
}
```

Reload nginx after editing: `nginx -t && systemctl reload nginx`.

## 2. DNS

```
financial   A      <public-ipv4-of-front-edge>
financial   AAAA   <public-ipv6-of-front-edge>   # optional
```

Verify with `dig +short financial.raumdock.org` before starting the stack —
Let's Encrypt cert issuance will fail otherwise.

## 3. LXC prep

Pick a deploy directory on `10.10.10.99` (e.g. `/opt/cc-financial`) and clone:

```bash
sudo mkdir -p /opt/cc-financial && sudo chown "$USER" /opt/cc-financial
git clone https://github.com/cccdemon/CC-Financial-Transparency.git /opt/cc-financial
cd /opt/cc-financial
```

Confirm port `3100` is free on the LXC (nothing else binding it):

```bash
ss -tlnp | grep ':3100'   # should be empty
```

## 4. Generate secrets

```bash
openssl rand -hex 32             # → SESSION_SECRET
openssl rand -hex 32             # → PUBLIC_OVERLAY_TOKEN
openssl rand -base64 32          # → POSTGRES_PASSWORD

# Admin password hash (bcrypt)
docker run --rm -i node:20-alpine sh -c \
  'npm i -s bcryptjs >/dev/null 2>&1 && node -e "console.log(require(\"bcryptjs\").hashSync(process.argv[1], 12))" "your-admin-password"'
```

## 5. .env.production

```bash
cp .env.production.example .env.production
nano .env.production
```

Required: `POSTGRES_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`,
`SESSION_SECRET`, `PUBLIC_OVERLAY_TOKEN`, `CADDY_ACME_EMAIL`.

`CADDY_HOST_PORT` defaults to **3100** — only change it if you also change the
front-edge nginx upstream to match.

## 6. Start the stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml logs -f
```

What happens on first boot:

1. Postgres starts and passes its healthcheck.
2. Web entrypoint runs `prisma db push` → tables created.
3. Web logs `Ready in <ms>`.
4. Caddy starts, asks Let's Encrypt for a cert via TLS-ALPN-01. The validator
   connects to `financial.raumdock.org:443` → front-edge nginx → `10.10.10.99:3100`
   → Caddy answers the ALPN challenge. Cert lands in the `cc_financial_caddy_data`
   volume.
5. `https://financial.raumdock.org/` resolves to `/financial`.

Sanity checks:

```bash
# From inside the LXC — bypass nginx, talk to Caddy directly:
curl -ksfI https://localhost:3100/financial -H 'Host: financial.raumdock.org'

# From anywhere on the internet — full path:
curl -sfI https://financial.raumdock.org/financial
```

## 7. First admin login

Open `https://financial.raumdock.org/admin/login`, sign in with `ADMIN_EMAIL`
plus the plaintext password you hashed in step 4.

## 8. OBS overlay

Browser Source URL:

```
https://financial.raumdock.org/overlay/financial?token=<PUBLIC_OVERLAY_TOKEN>&refresh=30
```

Default compact bar size: `1920x160`. Transparent background.

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

The `cc_financial_pgdata` and `cc_financial_caddy_data` volumes persist
across container rebuilds. Only `docker volume rm cc_financial_pgdata`
deletes the DB.

## Rollback

```bash
git log --oneline -5
git checkout <sha>
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

## Troubleshooting

**Caddy can't get a cert.** Most likely DNS isn't pointing at the front-edge
yet, or the front-edge nginx stream block has a typo. Check Caddy logs:
`docker compose -f docker-compose.prod.yml logs caddy`. The first cert request
is rate-limited by Let's Encrypt — wait at least an hour between failed
attempts.

**Front-edge can reach :3100 but TLS fails.** Verify the front-edge is doing
SNI passthrough (`ssl_preread on`) and **not** terminating TLS itself. If it
terminates, Caddy will receive plain HTTP and the handshake breaks.

**`prisma db push` refuses a schema change.** It's flagging a destructive
change. Add the migration manually, see the "Update flow" note above.

## Ports

| Component | Listen | Reachable from |
|---|---|---|
| caddy (this stack) | host `:3100` | front-edge nginx LAN side |
| web (Next.js) | container `:3000` | docker network only |
| postgres | container `:5432` | docker network only |
| front-edge nginx | public `:443` | internet |

No port on this LXC is publicly reachable except via the front-edge.
