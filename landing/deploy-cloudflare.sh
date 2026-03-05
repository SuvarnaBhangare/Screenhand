#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/dist}"

usage() {
  cat <<'EOF'
Usage:
  ./deploy-cloudflare.sh pages <project-name>
  ./deploy-cloudflare.sh workerd <worker-name>

Environment variables:
  CLOUDFLARE_API_TOKEN           Required for non-interactive shells.
  CLOUDFLARE_ACCOUNT_ID          Optional (some setups require it).
  CLOUDFLARE_PAGES_BRANCH        Default: main
  CLOUDFLARE_COMPATIBILITY_DATE  Default: today's date (YYYY-MM-DD)
  DIST_DIR                       Default: ./dist

Notes:
  - Uses `npx wrangler` when Node >= 20.
  - Falls back to `npx wrangler@3` when Node < 20.
EOF
}

if [[ ! -d "$DIST_DIR" ]]; then
  echo "Error: Dist directory not found at: $DIST_DIR"
  exit 1
fi

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

MODE="$1"
TARGET_NAME="$2"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -ge 20 ]]; then
  WRANGLER_CMD=(npx wrangler)
else
  WRANGLER_CMD=(npx wrangler@3)
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  cat <<'EOF'
Warning: CLOUDFLARE_API_TOKEN is not set.
If this shell is non-interactive, deploy will fail.
Create a token and export it:
  export CLOUDFLARE_API_TOKEN=...
EOF
fi

case "$MODE" in
  pages)
    BRANCH="${CLOUDFLARE_PAGES_BRANCH:-main}"
    exec "${WRANGLER_CMD[@]}" pages deploy "$DIST_DIR" \
      --project-name "$TARGET_NAME" \
      --branch "$BRANCH"
    ;;
  workerd|worker)
    COMPATIBILITY_DATE="${CLOUDFLARE_COMPATIBILITY_DATE:-$(date +%F)}"
    exec "${WRANGLER_CMD[@]}" deploy \
      --name "$TARGET_NAME" \
      --assets "$DIST_DIR" \
      --compatibility-date "$COMPATIBILITY_DATE"
    ;;
  *)
    usage
    exit 1
    ;;
esac
