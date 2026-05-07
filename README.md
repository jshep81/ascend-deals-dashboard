# Ascend Group — Deals Dashboard

Single-page dashboard for the Ascend Group team (Austin, San Antonio, Houston). Reads the team's master Google Sheet via an Apps Script JSONP endpoint and renders five views: YTD rollup, monthly drill-down, per-agent leaderboard, team summary, and a roster reconciliation pane that surfaces any agent name in the sheet that doesn't match the canonical team list.

## What it shows

- **YTD** — contracts, closed, pending, terminated, total volume, total commission, monthly trend, top 10 agents, and a market split for the calendar year.
- **Monthly** — month-by-month tabs with full deal table and per-agent breakdown for each month.
- **Agents** — leaderboard with filters (market, status, sort by volume / deals / commission / name) and search.
- **Team** — by-market, by-source, and by-status pivots plus a full all-time leaderboard.
- **Roster** — every raw `Agent` value in the sheet mapped to its canonical name. Anything unresolved is flagged so you can either fix it in the sheet or add an alias in `index.html`.

## Architecture

```
Google Sheet (multi-tab, one per month)
         |
         v
Apps Script web app (doGet returns JSONP)
         |
         v
GitHub Pages (static index.html)
```

- No server, no build step, no dependencies. Drop `index.html` on Pages and it works.
- Auth is a soft token in the URL — keep the URL out of public posts.
- The dashboard lazily walks every tab on each load. Cache headers default to ~5 minutes via Apps Script.

## File map

- `index.html` — the dashboard. Edit the two constants at the top (`ENDPOINT`, `TOKEN`) and the `ROSTER` array.
- `AppsScript.gs` — the server-side script that reads the sheet and serves JSONP.
- `README.md` — this file.

## Setup

### 1. Deploy the Apps Script

1. Open the master sheet.
2. **Extensions → Apps Script**.
3. Replace any existing code with the contents of `AppsScript.gs`.
4. Save.
5. Click **Run** on `doGet` once and grant the permissions Google asks for.
6. **Deploy → New deployment**.
   - Type: **Web app**
   - Description: `Ascend Deals API v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the resulting Web app URL.

### 2. Wire up the dashboard

Edit `index.html`:

```js
const ENDPOINT = 'https://script.google.com/macros/s/.../exec';
const TOKEN = 'ascend-2026';
```

Then update the `ROSTER` array with each canonical agent and any aliases that appear in the sheet:

```js
const ROSTER = [
  { canonical: 'Justin Sheppard', market: 'Austin',
    aliases: ['justin', 'j sheppard', 'jshep'] },
  // ...
];
```

### 3. Deploy on GitHub Pages

```bash
git init
git add .
git commit -m "Initial dashboard"
git branch -M main
git remote add origin https://github.com/jshep81/ascend-deals-dashboard.git
git push -u origin main
```

Then in the repo on github.com:

- **Settings → Pages**
- Source: **Deploy from a branch**
- Branch: **main** / root
- Save

After ~30 seconds the dashboard is live at:
`https://jshep81.github.io/ascend-deals-dashboard/`

## Schema expected in the sheet

| Column | Notes |
|---|---|
| First Name | Client first |
| Last Name | Client last |
| Email | Client email |
| Address | Property |
| Zip Code | |
| Executed | Contract execution date |
| Option | Option period end |
| Financing | Financing deadline |
| Close Date | Used for monthly grouping; falls back to tab name |
| Price | Sales price |
| Market | Austin / San Antonio / Houston |
| Agent | Resolved against `ROSTER` aliases |
| Lender | |
| Title | Title company |
| Source | Lead source (Zillow, sphere, FUB, etc.) |
| Total Commission | Gross commission |
| Agency Commission | Company dollar |
| Status | DA sent, Closed, Terminated, etc. |
| NOTES | Free text |

The Apps Script tolerates header variants (e.g., "Sales Price" / "Purchase Price" / "Price") via `HEADER_ALIASES`. Add aliases there if your column names drift.

## Adding a new agent

When a new agent shows up in the sheet:

1. Open the dashboard, go to the **Roster** tab.
2. Find their raw name; copy it.
3. In `index.html`, add a new entry to `ROSTER` — `canonical` is their proper full name; any sheet variants go in `aliases`.
4. Commit, push, refresh the dashboard.
