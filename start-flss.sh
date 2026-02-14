#!/bin/bash
export HOST=0.0.0.0
export PORT=3000
export NODE_ENV=production

echo "Starting FLSS Production Server..."
node server.js &
SERVER_PID=$!

sleep 3

echo "Starting Cloudflare Tunnel..."
cloudflared tunnel --url http://localhost:3000

kill $SERVER_PID
