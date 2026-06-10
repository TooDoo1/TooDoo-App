#!/usr/bin/env bash
# Start Expo web dev server reachable from other devices on the same Wi-Fi.
set -euo pipefail

cd "$(dirname "$0")/.."

# Prefer the interface used for the default route (works on most Linux laptops).
LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
if [ -z "${LAN_IP:-}" ]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi

PORT="${PORT:-8081}"

if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TooDoo web over Wi-Fi"
echo ""
if [ -n "${LAN_IP:-}" ]; then
  echo "  On your phone (same Wi-Fi), open:"
  echo "    http://${LAN_IP}:${PORT}"
else
  echo "  Could not detect LAN IP. Check Metro output for exp://…"
fi
echo ""
echo "  Do NOT use localhost on your phone — that is this computer only."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

export REACT_NATIVE_PACKAGER_HOSTNAME="${LAN_IP:-}"
export EXPO_DEVTOOLS_LISTEN_ADDRESS="0.0.0.0"

exec npx expo start --web --host lan --port "$PORT" "$@"
