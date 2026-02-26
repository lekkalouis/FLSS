# Cloudflare Tunnel Setup for FLSS

Use this guide to expose a local FLSS instance through a Cloudflare-managed hostname.

## 1) Prerequisites

- Cloudflare-managed domain.
- `cloudflared` installed and authenticated.
- FLSS running locally on port `3000` (or your configured port).

```bash
npm install
npm run dev
```

## 2) Authenticate `cloudflared`

```bash
cloudflared tunnel login
```

## 3) Create tunnel

```bash
cloudflared tunnel create flss-local
```

Save the printed tunnel UUID.

## 4) Create DNS route

```bash
cloudflared tunnel route dns flss-local flss.yourdomain.com
```

## 5) Configure tunnel ingress

Create/update `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/<user>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: flss.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

## 6) Run tunnel

```bash
cloudflared tunnel run flss-local
```

Then open `https://flss.yourdomain.com`.

## 7) Optional: run as system service (Linux)

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

## 8) Troubleshooting

- **502 errors:** app not running on target local port.
- **DNS not resolving:** route command not run or wrong hostname.
- **SSL/browser loops:** ensure proxied DNS setup and tunnel health.
- **Quick temporary test:**

```bash
cloudflared tunnel --url http://localhost:3000
```
