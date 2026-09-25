# Vodafone Egypt Assistant — Auto-Sync System

## What it does
Every day at **09:00** (Windows Task Scheduler: `VodafoneAssistantSync`), the system
re-reads key pages on **vodafone.com.eg** and refreshes the assistant's data:

| Source page | What is captured |
|---|---|
| `/en/vodafone-red1` | RED plan names, data GB, minutes, monthly prices (tax-exclusive) |
| `/en/mobile-internet-bundles` | Plus bundle quotas (MB) + prices, Plus Apps bundles |
| `/en/vodafone-cash` | Presence check of `*9#`, `*9*5#`, `*9*9#` |
| `/en/kart-el-korout` | Presence check of `*86#`, `*85#`, `*9#` |

## Files
- `sync/sync.js` — the scraper + differ. Run modes:
  - `node sync/sync.js` — normal run (writes only if something changed)
  - `node sync/sync.js --check` — report only, never writes
  - `node sync/sync.js --force` — rewrite files even with no changes
- `sync/task.js` — wrapper used by the scheduled task (lock + logging)
- `sync/live-data.json` — synced data + metadata (`lastSync`, `lastChange`)
- `sync/changes.log` — human-readable change history
- `sync/task-run.log` — every scheduled run's output
- `live-data.js` — browser copy of live data (`window.VF_LIVE`), loaded by index.html
- `sync/verify.js` — self-test (19 checks) — `node sync/verify.js`

## How the site consumes it (non-destructive)
`index.html` keeps its **static tables as the base**. After page load, the
`applyLive()` overlay patches the RED and Plus table cells **in-place** with
fresh values from `window.VF_LIVE`:

- RED rows are matched by plan name (`RED ESSENTIAL+` → `RED Essential+` row)
- Plus rows are matched by label (`Plus 37`), with positional fallback so a
  renamed bundle (e.g. `Plus 37 → Plus 42`) still updates the correct row
- The header shows a **Live sync** chip with the last sync date, and the banner
  shows "auto-sync active, last checked …"
- If `live-data.js` is missing, corrupt, or stale — **the site still works
  exactly as before** (static data, chip shows "off"). Nothing breaks.

## Handling changes
When Vodafone changes a price/quota:
1. sync detects the difference (`changes.log` gets an entry like
   `[RED] RED ELITE+: EGP 2000 → EGP 2100`)
2. `sync/live-data.json` + `live-data.js` are rewritten with the new values
3. Next page open — visitors see the new numbers in both English and Arabic

## Manual commands
```powershell
# run a sync now
& (Get-Command node).Source "C:\Users\Elostaz\Documents\Default Project\vodafone-assistant\sync\sync.js"

# dry-run (see what would change)
& (Get-Command node).Source "C:\Users\Elostaz\Documents\Default Project\vodafone-assistant\sync\sync.js" --check

# run all self-tests
& (Get-Command node).Source "C:\Users\Elostaz\Documents\Default Project\vodafone-assistant\sync\verify.js"

# task status
Get-ScheduledTaskInfo -TaskName "VodafoneAssistantSync"
```

## Troubleshooting
- **Node path** — node lives at `%LOCALAPPDATA%\hermes\node\node.exe` on this
  machine; the task was registered with that absolute path. If you move node,
  re-register the task.
- **Anti-bot changes on the site** — if a page's HTML class names change
  (`card-plan-header`, `card-subscription-body-amount`), the scraper for that
  area returns zero items and logs it; the site keeps the last good data.
- **Lock file** — `sync/.lock` appears only while a run is active; a stale one
  (older than 30 min) is removed automatically.
