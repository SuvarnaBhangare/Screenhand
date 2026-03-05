# Cloudflare publish guide (`landing/dist`)

## What was failing
- `npx wrangler` tried to install Wrangler v4 and failed on Node 18 (`Wrangler requires at least Node.js v20.0.0`).
- Pages publish in non-interactive mode failed without token (`CLOUDFLARE_API_TOKEN` required).

## Quick publish commands
From `landing/`:

```bash
./deploy-cloudflare.sh pages <your-pages-project-name>
./deploy-cloudflare.sh workerd <your-worker-name>
```

The script:
- Uses `npx wrangler` on Node 20+.
- Falls back to `npx wrangler@3` on Node 18.
- Publishes `./dist` for both Pages and Workers/workerd runtime.

## Required auth
For non-interactive shells, set:

```bash
export CLOUDFLARE_API_TOKEN=...
```

Optional:

```bash
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_PAGES_BRANCH=main
export CLOUDFLARE_COMPATIBILITY_DATE=2026-03-05
```

## Recommended long-term setup
Upgrade Node to 20+ and use latest Wrangler:

```bash
npm install --save-dev wrangler@4
npx wrangler --version
```
