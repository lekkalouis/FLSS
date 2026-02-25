# Cloudflare Tunnel setup for FLSS

Use this guide when you want your local FLSS instance (running on `localhost:3000`) to be reachable from your Cloudflare-managed domain.

## 1) Prerequisites

- Your domain is active in Cloudflare.
- `cloudflared` is installed locally.
- FLSS is running locally:

```bash
npm install
npm start
```

By default the app listens on `http://localhost:3000`.

## 2) Authenticate cloudflared

```bash
cloudflared tunnel login
```

This opens Cloudflare in your browser and stores certs for your account.

## 3) Create a named tunnel

```bash
cloudflared tunnel create flss-local
```

Save the generated tunnel UUID from the command output.

## 4) Map a DNS hostname to the tunnel

Pick a hostname you want to use, for example `flss.yourdomain.com`:

```bash
cloudflared tunnel route dns flss-local flss.yourdomain.com
```

Cloudflare will create the required DNS CNAME record.

## 5) Create local tunnel config

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/<your-user>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: flss.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

Notes:
- Replace `<TUNNEL_UUID>` and `<your-user>`.
- If FLSS runs on a different port, update the `service` URL.

## 6) Run the tunnel

```bash
cloudflared tunnel run flss-local
```

Open your hostname in the browser once the tunnel shows connected.

## 7) (Optional) Run as a service

On Linux:

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

This keeps the tunnel up after reboots.

## Quick troubleshooting

- **502 / Bad gateway:** FLSS is not running on the local port configured in ingress.
- **Hostname not resolving:** verify DNS route command was run for the correct tunnel and domain.
- **Browser loops/SSL issues:** ensure the DNS record is proxied through Cloudflare and points to the tunnel target.
- **Need temporary quick test:**

```bash
cloudflared tunnel --url http://localhost:3000
```

This is the free ephemeral tunnel (changes URL every run), useful to verify local app connectivity before using your domain hostname.
