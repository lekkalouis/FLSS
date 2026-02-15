# FLSS Database + Remote Access Setup Guide

This guide moves FLSS from local JSON files to a production-ready PostgreSQL setup and gives you a secure public tunnel so operators can connect from outside your network.

## 1) Recommended architecture

For FLSS, the most appropriate database is **PostgreSQL** because:

- It handles relational operational data (orders, invoices, inspections) cleanly.
- It supports JSON (`JSONB`) for flexible fields used in pricing rules.
- It is robust for server deployments, backups, indexing, and access controls.

Recommended deployment shape:

- **App server**: FLSS Node app running on Linux VM/container.
- **DB server**: managed PostgreSQL (Neon/Supabase/RDS) or self-hosted PostgreSQL service.
- **Tunnel edge**: Cloudflare Tunnel (preferred for stable hostname + zero inbound ports).

---

## 2) Database schema script

Use the SQL file in this repo:

- `db/schema.sql`

Apply it with:

```bash
npm run db:setup
```

What it creates:

- Pricing tables: `price_lists`, `price_rules`
- Traceability tables: `open_purchase_orders`, `invoices`, `invoice_items`, `document_captures`, `coas`, `incoming_inspections`, `finished_batches`, `finished_batch_components`
- Proper keys, indexes, and cascade rules for operations workflows.

---

## 3) Provision PostgreSQL (step-by-step)

### Option A (recommended): Managed PostgreSQL

1. Create an account (Neon, Supabase, Railway, Aiven, Render, or AWS RDS).
2. Create a new PostgreSQL project/instance.
3. Copy connection string (`postgres://user:pass@host:5432/dbname?sslmode=require`).
4. Save it as `DATABASE_URL` in your server environment.
5. Run schema:
   ```bash
   npm run db:setup
   ```

### Option B: Self-host PostgreSQL on Ubuntu

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Create DB/user:

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE flss_app WITH LOGIN PASSWORD 'REPLACE_ME_STRONG_PASSWORD';
CREATE DATABASE flss_prod OWNER flss_app;
GRANT ALL PRIVILEGES ON DATABASE flss_prod TO flss_app;
SQL
```

Connect/apply schema:

```bash
export DATABASE_URL='postgres://flss_app:REPLACE_ME_STRONG_PASSWORD@127.0.0.1:5432/flss_prod'
npm run db:setup
```

---

## 4) App environment variables

Add these to your server `.env` (or secrets manager):

```bash
DATABASE_URL=postgres://flss_app:...@db-host:5432/flss_prod?sslmode=require
DATABASE_SSL=true
```

Keep existing integrations (Shopify, PrintNode, SMTP, ParcelPerfect) unchanged.

> Note: current FLSS code still reads/writes JSON for pricing + traceability. The schema is ready now, and application route/service migration to SQL can be done incrementally per module.

---

## 5) Move data from local JSON to PostgreSQL

Current local stores:

- `data/pricing-model.json`
- `data/traceability.json`

Suggested migration approach:

1. Export/backup existing JSON files.
2. Build one-time import script that maps JSON arrays to SQL tables.
3. Run import in staging first.
4. Verify record counts + sample lookups.
5. Cut over app writes to PostgreSQL.
6. Keep JSON as read-only backup for rollback.

---

## 6) FLSS database usage (Order Economics)

After DB setup, Order Economics relies on the following:

- `flss_cost_categories`: seeded default categories
- `flss_cost_ledger`: monthly + per-order costs
- `flss_kpi_snapshots`: scheduled KPI history

### Typical workflow

1. Ensure app env includes:
   ```bash
   DATABASE_URL=postgres://...
   DATABASE_SSL=true
   FLSS_STAFF_HOURLY_RATE=0
   ```
2. Start server (`npm run dev`).
3. Enter costs in `/admin/costs` or POST to `/api/v1/costs`.
4. Query monthly totals via `/api/v1/costs?month=YYYY-MM`.
5. View computed KPIs at `/api/v1/analytics/order-economics` and dashboard page.

### Useful SQL checks

```sql
SELECT month, cost_category, SUM(amount_zar) AS total
FROM flss_cost_ledger
GROUP BY month, cost_category
ORDER BY month DESC, cost_category;

SELECT date, total_orders, avg_sale_price, cost_per_order, margin_percent
FROM flss_kpi_snapshots
ORDER BY created_at DESC
LIMIT 30;
```

## 7) Remote access tunnel (recommended: Cloudflare Tunnel)

Cloudflare Tunnel gives stable secure access without opening inbound firewall ports.

### 7.1 Create account + domain

1. Sign up at Cloudflare.
2. Add your domain to Cloudflare DNS.
3. Point registrar nameservers to Cloudflare (if prompted).

### 7.2 Install `cloudflared`

Ubuntu/Debian example:

```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
cloudflared --version
```

### 7.3 Authenticate machine

```bash
cloudflared tunnel login
```

- Browser opens.
- Choose your domain.
- Cloudflare stores cert at `~/.cloudflared/`.

### 7.4 Create tunnel

```bash
cloudflared tunnel create flss-prod
```

Save returned **Tunnel UUID**.

### 7.5 Create config file

`~/.cloudflared/config.yml`

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/<user>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: flss.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### 7.6 Route DNS to tunnel

```bash
cloudflared tunnel route dns flss-prod flss.yourdomain.com
```

### 7.7 Run test

```bash
cloudflared tunnel run flss-prod
```

Open `https://flss.yourdomain.com` and verify app loads.

### 7.8 Install as service (auto restart)

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

### 7.9 Maintenance

- Update binary monthly:
  ```bash
  sudo apt update && sudo apt install --only-upgrade cloudflared
  ```
- Rotate origin/API credentials periodically.
- Use Cloudflare Access policies (email/SSO) for admin protection.
- Monitor tunnel health:
  ```bash
  journalctl -u cloudflared -f
  ```

---

## 8) Alternative tunnel (ngrok)

Use this if you want quick testing.

1. Create account at ngrok.com.
2. Copy your authtoken from dashboard.
3. Install ngrok.
4. Activate token:
   ```bash
   ngrok config add-authtoken <YOUR_TOKEN>
   ```
5. Run tunnel:
   ```bash
   ngrok http 3000
   ```
6. Use generated HTTPS URL.

For long-running production endpoints, Cloudflare Tunnel is usually more stable and easier to pair with your own domain.

---

## 9) Production hardening checklist

- Run FLSS behind process manager (`pm2` or systemd).
- Enforce HTTPS at tunnel edge.
- Restrict CORS (`FRONTEND_ORIGIN`) to your real hostname.
- Store secrets in server env/secrets manager, not in Git.
- Enable PostgreSQL backups + point-in-time recovery.
- Add uptime monitoring for app + tunnel + DB.

---

## 10) Quick command checklist

```bash
# 1) Apply schema
npm run db:setup

# 2) Start app (example)
npm ci
npm run dev

# 3) Start cloudflare tunnel
cloudflared tunnel run flss-prod
```

