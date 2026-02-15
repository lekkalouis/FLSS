@echo off
set HOST=0.0.0.0
set PORT=3000
set NODE_ENV=production

echo Starting FLSS Production Server...
start "FLSS Server" cmd /c "node server.js"

timeout /t 3 /nobreak >nul

echo Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /c "cloudflared tunnel --url http://localhost:3000"

echo FLSS server and Cloudflare tunnel launched.
