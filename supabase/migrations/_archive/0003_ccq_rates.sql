-- CCQ wage-rate snapshot cache.
-- One row per (occupationId, sectorId, skillId, ratesToDate) fetch.
-- Raw JSON is kept for audit / re-parsing; content_hash prevents duplicates
-- when CCQ returns the same data on multiple syncs.

create table if not exists public.ccq_rate_snapshots (
  id              uuid primary key default gen_random_uuid(),
  occupation_id   text not null,
  occupation_name text,
  sector_id       text not null,
  sector_name     text,
  skill_id        text not null,
  skill_name      text,
  annex_id        text not null default 'ALL',
  rates_to_date   date not null,
  source_url      text not null,
  raw_json        jsonb not null,
  content_hash    text not null,
  fetched_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Fast cache lookup: latest snapshot for a given parameter set
create index if not exists ccq_snapshots_lookup_idx
  on public.ccq_rate_snapshots (occupation_id, sector_id, skill_id, rates_to_date, fetched_at desc);

-- Manager-only RLS
alter table public.ccq_rate_snapshots enable row level security;

create policy "ccq_rate_snapshots: manager read"
  on public.ccq_rate_snapshots for select
  using (public.get_my_role() = 'manager');

create policy "ccq_rate_snapshots: service insert"
  on public.ccq_rate_snapshots for insert
  with check (true);
