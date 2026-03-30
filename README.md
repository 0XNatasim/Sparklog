# SparkLog

**SparkLog** is a mobile-first job and time tracking application for field employees and managers.

Employees log work orders, hours, and kilometers directly from their phone. Managers review, approve, and export validated records to Google Sheets.

---

## Core Features

### Employee
- Secure sign-up with email verification
- Create work orders (OT)
- Enter departure, arrival, and end times (15-minute intervals)
- Automatic hour calculation (displayed as `2h45`)
- Track kilometers per job
- Save jobs as drafts
- Submit jobs for approval
- Edit or delete **own saved jobs only**
- View job history grouped by date
- Weekly summary view (hours, km, OT count)

### Manager
- View all employees and their submitted jobs
- Filter jobs by employee, status, or search term
- Approve submitted jobs
- Export approved jobs to Google Sheets
- View weekly summaries per employee

---

## Roles & Permissions

| Action | Employee | Manager |
|--------|----------|---------|
| Create job | yes | no |
| Edit saved job (own) | yes | no |
| Delete saved job (own) | yes | no |
| Submit job | yes | no |
| Approve job | no | yes |
| Export to Google Sheets | no | yes |

> A manager who is also the job owner can still edit or delete **their own saved jobs**.

---

## Tech Stack

- **Frontend**: React + Vite, React Router, Day.js
- **Backend**: Supabase (Auth + PostgreSQL), Supabase Edge Functions (Deno)
- **Export**: Google Apps Script
- **Hosting**: Render (frontend), Supabase (backend & auth)

---

## Supabase Setup

### 1. Tables

Run the following SQL in the Supabase SQL editor.

#### `profiles`

```sql
create table public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email     text,
  phone     text,
  role      text not null default 'employee' check (role in ('employee', 'manager'))
);
```

#### `jobs`

```sql
create table public.jobs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  job_date          date not null,
  ot                text,
  depart            time,
  arrivee           time,
  fin               time,
  km_aller          numeric default 0,
  status            text not null default 'saved'
                      check (status in ('saved', 'updated', 'submitted', 'approved')),
  locked            boolean not null default false,
  exported_to_sheet boolean not null default false,
  exported_at       timestamptz,
  exported_by       uuid references public.profiles(id)
);
```

### 2. Auto-create profile on sign-up

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### 3. Row Level Security (RLS)

Enable RLS on both tables, then apply the policies below.

```sql
alter table public.profiles enable row level security;
alter table public.jobs     enable row level security;
```

#### Profiles policies

```sql
-- Users can read their own profile
create policy "profiles: own read"
  on public.profiles for select
  using (auth.uid() = id);

-- Managers can read all profiles
create policy "profiles: manager read all"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );

-- Users can update their own profile
create policy "profiles: own update"
  on public.profiles for update
  using (auth.uid() = id);
```

#### Jobs policies

```sql
-- Employees can read their own jobs
create policy "jobs: own read"
  on public.jobs for select
  using (auth.uid() = user_id);

-- Managers can read all jobs
create policy "jobs: manager read all"
  on public.jobs for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );

-- Employees can insert their own jobs
create policy "jobs: own insert"
  on public.jobs for insert
  with check (auth.uid() = user_id);

-- Employees can update their own unlocked jobs
create policy "jobs: own update unlocked"
  on public.jobs for update
  using (auth.uid() = user_id and locked = false);

-- Employees can delete their own saved/updated (unlocked) jobs
create policy "jobs: own delete unlocked"
  on public.jobs for delete
  using (auth.uid() = user_id and locked = false);
```

### 4. Edge Function environment variables

Set these secrets in **Supabase > Project Settings > Edge Functions**:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | Your project URL |
| `SUPABASE_ANON_KEY` | Your anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key |
| `APPS_SCRIPT_URL` | Your Google Apps Script web app URL |
| `APPS_SCRIPT_TOKEN` | Shared secret token for the Apps Script |

Deploy the edge function:

```bash
supabase functions deploy push_approved_to_sheet
```

---

## Render Deployment

The `render.yaml` at the repo root configures a static site on [Render](https://render.com).

### Settings

| Setting | Value |
|---------|-------|
| Type | Static Site |
| Build command | `npm run build` |
| Publish directory | `./dist` |
| SPA rewrite | All routes → `/index.html` |

### Environment variables

Set these in **Render > Environment**:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

### Steps

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New > Static Site**
3. Connect the repository — Render auto-detects `render.yaml`
4. Add the environment variables above
5. Deploy

---

## Approval & Export Flow

1. Employee submits a job
2. Manager reviews and clicks **Approve**
3. Supabase Edge Function:
   - Verifies manager role
   - Confirms job status is `submitted`
   - Fetches employee name, email, phone
   - POSTs data to Google Apps Script
4. Google Sheet receives a new row
5. Job is locked and marked as exported

---

## Local Development

```bash
npm install
cp .env.example .env.local   # add your Supabase keys
npm run dev
```

`.env.local`:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## TODO

### Google Apps Script export (not yet configured)

The edge function `push_approved_to_sheet` is ready but the Google Apps Script endpoint has not been set up yet.

When ready:
1. Create a Google Apps Script project at [script.google.com](https://script.google.com)
2. Add a `doPost(e)` function that appends rows to a Google Sheet
3. Validate the `APPS_SCRIPT_TOKEN` inside `doPost` to secure the endpoint
4. Deploy as a **Web app** (access: Anyone)
5. Copy the Web app URL → set as `APPS_SCRIPT_URL` in Supabase Edge Function secrets
6. Set the matching `APPS_SCRIPT_TOKEN` secret in Supabase

Until this is configured, the **Approve** button will fail when attempting to export.

---

## License

Private / Internal Use — All rights reserved.
