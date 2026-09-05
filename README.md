# Tuesday Doubles Ladder — backend + live ladder

A tiny Vercel app that reads and writes your **Tuesday Doubles Ladder** Airtable base,
runs the Glicko-2 rating engine server-side, and shows a live ladder on the web.

No build step, no framework, no dependencies — static `index.html` + serverless
functions in `/api`.

## Deploy (about 2 minutes, uses your own Vercel login)

**Option A — GitHub → Vercel (matches how you already deploy)**
1. Create a new GitHub repo (e.g. `tuesday-doubles-ladder`) and push these files to it.
2. In Vercel: **Add New… → Project → Import** that repo.
3. On the import screen, add the two environment variables below, then **Deploy**.

**Option B — Vercel CLI**
1. Install once: `npm i -g vercel`
2. In this folder: `vercel` (follow prompts), then add the env vars, then `vercel --prod`.

## The two environment variables

| Name | Value |
|------|-------|
| `AIRTABLE_TOKEN` | your Airtable personal access token (see below) |
| `AIRTABLE_BASE_ID` | `appHS8TotHpCLuRib` |

### Creating the Airtable token
1. Go to https://airtable.com/create/tokens and create a token.
2. Scopes: `data.records:read` and `data.records:write`.
3. Access: add the **Tuesday Doubles Ladder** base.
4. Copy the token into `AIRTABLE_TOKEN` in Vercel.

After adding the vars, redeploy (or they apply on the next deploy). Open the site —
you should see your live ladder pulled straight from Airtable. Until the token is set,
the page shows a friendly setup screen instead.

## API

- `GET  /api/state` — ladder + honours board, read from Airtable.
- `POST /api/save-night` — runs Glicko-2, writes the session, matches, ratings, and history.
- `POST /api/resolve-tiebreak` — logs the on-court playoff winner.
- `POST /api/roster` — add a player, or set a player active/inactive.

The Glicko-2 engine (`api/_lib/glicko.mjs`) and night logic (`api/_lib/logic.mjs`)
are the same, numerically-verified engine used throughout.
