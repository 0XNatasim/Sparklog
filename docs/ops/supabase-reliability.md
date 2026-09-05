# Supabase reliability & keep-warm

SparkLog must be usable by managers **at any hour**. This note explains how that's
handled today on the free tier, and when to move to Pro.

## Current setup (free tier)

Two layers keep the app responsive despite free-tier cold starts:

1. **Client auto-retry** — `withRetry` in `src/lib/utils.js` retries a stalled Supabase
   read a few times with a short backoff (and one session refresh). A cold start
   self-heals instead of showing an error. All manager-dashboard reads use it.
2. **24/7 keep-warm heartbeat** — `.github/workflows/keep-warm.yml` POSTs to the
   `public.ping()` RPC (migration 0025) every ~10 minutes so Postgres never goes cold.

### Required setup for the heartbeat
- Repo secrets (Settings → Secrets and variables → Actions):
  - `SUPABASE_URL` = `https://sqpsjmyycxxwfstmpgom.supabase.co`
  - `SUPABASE_ANON_KEY` = the project's public anon key (same one the frontend uses)
- The workflow only runs from the **default branch** (`main`) — GitHub schedules cron
  from main only. It starts firing after this is merged.

### Known limits (why this is best-effort, not an SLA)
- GitHub cron drifts (a "10-minute" ping may land 15–20 min apart under load).
- Free-tier compute is shared, so a rare latency spike can still occur (retry covers it).
- A free project still auto-pauses after ~7 days of **total** inactivity — daily weekday
  use already prevents this, and the heartbeat makes it a non-issue.

## Recommendation: move to Supabase Pro when uptime is critical

For a payroll-facing tool that must "always be operational," the robust fix is
**Supabase Pro (~$25/month)**:

- **No pausing** and steadier, non-shared-throttled compute — removes the cold-start
  spikes at the source (the free-tier keep-warm is a workaround for exactly this).
- **Daily automated backups** with point-in-time recovery options — important once this
  holds real payroll-adjacent data.
- Higher limits (storage, egress, connections) as the crew and history grow.

**Suggested path:** ship the free keep-warm now; watch for a couple of weeks. If *any*
stall reaches a manager, upgrade to Pro. Nothing is wasted — `withRetry` and the
heartbeat stay useful on Pro too. Revisit at the latest when SparkLog is treated as the
source of truth for payroll export (see `GPT.md` M11 staged-release / SLO work).
