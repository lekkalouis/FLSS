# Cloudflare Tunnel Setup for FLSS

Use this guide to expose a local FLSS instance through a Cloudflare-managed hostname.

## 1. Prerequisites

- A Cloudflare-managed domain
- `cloudflared` installed and authenticated
- FLSS running locally on port `3000` or your configured `PORT`
- `FRONTEND_ORIGIN` set to the public hostname you want users to access

Example:

```dotenv
FRONTEND_ORIGIN=https://flss.example.com
```

## 2. Authenticate `cloudflared`

```bash
cloudflared tunnel login
```

## 3. Create the tunnel

```bash
cloudflared tunnel create flss-local
```

Save the printed tunnel UUID.

## 4. Create the DNS route

```bash
cloudflared tunnel route dns flss-local flss.example.com
```

## 5. Configure ingress

Create or update `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/<user>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: flss.example.com
    service: http://localhost:3000
  - service: http_status:404
```

Because the app serves both HTTP and WebSocket traffic from the same origin, `/ws/controller` flows through the same tunnel without extra ingress rules.

## 6. Run the tunnel

```bash
cloudflared tunnel run flss-local
```

Then open `https://flss.example.com`.

## 7. Operational notes

- OAuth deployments usually need `OAUTH_REDIRECT_URI` to point at the public hostname.
- The public `/deliver` route can stay on the same hostname as the main app.
- If you use the GitHub update webhook, point the webhook at `https://flss.example.com/__git_update`.

## 8. Troubleshooting

- `502` errors: FLSS is not listening on the target local port.
- Login redirect loops: `FRONTEND_ORIGIN` or `OAUTH_REDIRECT_URI` does not match the public hostname.
- WebSocket clients fail: confirm the tunnel is serving the same hostname used by `/ws/controller`.
- Quick temporary test:

```bash
cloudflared tunnel --url http://localhost:3000
```
