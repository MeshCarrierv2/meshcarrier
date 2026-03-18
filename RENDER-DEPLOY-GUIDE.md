# MeshCarrier — Render.com Deploy Guide

## Step 1 — Push to GitHub

On your PC:
```bash
cd C:\Users\start\OneDrive\Desktop\meshcarrier
git init
git add .
git commit -m "MeshCarrier v2.2 - PostgreSQL"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/meshcarrier.git
git push -u origin main
```

## Step 2 — Create Render Account
Go to render.com → Sign up with GitHub

## Step 3 — Deploy with render.yaml (Blueprint)

1. Render Dashboard → **New → Blueprint**
2. Connect your GitHub repo
3. Render reads `render.yaml` automatically and creates:
   - Web service (Node.js backend)
   - PostgreSQL database (free)

## Step 4 — Set Environment Variables

In Render Dashboard → your web service → **Environment**:

| Key | Value |
|-----|-------|
| `SUPERADMIN_EMAIL` | your@email.com |
| `SUPERADMIN_PASSWORD` | StrongPassword123! |
| `USER_EMAIL` | user@email.com |
| `USER_PASSWORD` | UserPassword123! |
| `USER_NAME` | Your Name |
| `USER_PLAN` | NODE |
| `LIVE_MODE` | true |

## Step 5 — Seed the Database

In Render Dashboard → your service → **Shell**:
```bash
node -r dotenv/config reseed-live.js
```
Copy the Node Key from the output.

## Step 6 — Host the Portal HTML

Option A — Render Static Site (free):
1. New → Static Site → your repo
2. Root: `/` (or wherever meshcarrier-portal.html is)
3. Build command: (leave blank)
4. Publish directory: `.`

Then update the API URL in the portal to your Render backend URL.

## Step 7 — Connect Pixel Fold

In Termux `.env`:
```
NODE_KEY=<key from step 5>
CORE_URL=https://meshcarrier-api.onrender.com
NODE_TYPE=relay
```

Node connects from anywhere — 4G, 5G, any WiFi globally.

## Step 8 — Auto-deploy on push

1. Render Dashboard → your service → **Settings → Deploy Hook**
2. Copy the hook URL
3. Add GitHub Secret: `RENDER_DEPLOY_HOOK` = that URL
4. Now every `git push` auto-deploys in ~2 minutes

## Useful URLs After Deploy

- API: `https://meshcarrier-api.onrender.com/api`
- Portal: Open `meshcarrier-portal.html` locally (points to Render API)
- Or host portal on Render Static Site for fully public access

## Note on Free Tier

Render free web services spin down after 15 min of inactivity.
First request after sleep takes ~30 seconds.
Upgrade to $7/mo Starter plan to keep it always-on.
The PostgreSQL free plan is always-on — no sleeping.
