# SparkLog

SparkLog is a mobile-friendly app for field employees and managers to track work orders, hours, and kilometers.

- **Employees** log jobs from their phone, save them as drafts, and submit them for approval. They can also take a photo of a work order sheet to auto-fill the form.
- **Managers** review submitted jobs, approve them, and export them to Google Sheets.

---

## What you need before starting

- A free [Supabase](https://supabase.com) account (the database and backend)
- A free [Render](https://render.com) account (hosts the website)
- A [GitHub](https://github.com) account (to connect your code to Render)
- An [Anthropic](https://console.anthropic.com) API key (for the auto-fill from photo feature)
- A Google account (for the Google Sheets export)
- [Node.js](https://nodejs.org) installed on your computer (only needed if running locally)

---

## Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New project**
3. Give it a name (e.g. `sparklog`), choose a region close to you, set a database password
4. Wait for the project to finish setting up (~1 minute)

---

## Step 2 — Create the database tables

Go to **SQL Editor** in the left sidebar and run each block below one at a time.

### Profiles table (stores employee/manager info)

```sql
create table public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  full_name text default '',
  email     text default '',
  phone     text default '',
  role      text not null default 'employee' check (role in ('employee', 'manager'))
);
```

### Jobs table (stores work orders)

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
  exported_by       uuid references public.profiles(id),
  updated_at        timestamptz default now()
);
```

### Auto-update `updated_at` when a job is edited

```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();
```

---

## Step 3 — Auto-create a profile when someone signs up

This makes sure every new user automatically gets a profile row.

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, phone, email)
  values (
    NEW.id,
    'employee',
    coalesce(NEW.raw_user_meta_data->>'full_name', ''),
    coalesce(NEW.raw_user_meta_data->>'phone', ''),
    coalesce(NEW.email, '')
  )
  on conflict (id) do nothing;
  return NEW;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## Step 4 — Set up security rules (RLS)

This controls who can see and edit what. Run all of this in the SQL Editor.

```sql
-- Enable security on both tables
alter table public.profiles enable row level security;
alter table public.jobs     enable row level security;

-- Helper function to get the current user's role (avoids a known recursion bug)
create or replace function public.get_my_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- PROFILES: everyone can read their own profile
create policy "profiles: own read"
  on public.profiles for select
  using (auth.uid() = id);

-- PROFILES: managers can read all profiles
create policy "profiles: manager read all"
  on public.profiles for select
  using (get_my_role() = 'manager');

-- PROFILES: everyone can update their own profile
create policy "profiles: own update"
  on public.profiles for update
  using (auth.uid() = id);

-- JOBS: employees can read their own jobs
create policy "jobs: own read"
  on public.jobs for select
  using (auth.uid() = user_id);

-- JOBS: managers can read all jobs
create policy "jobs: manager read all"
  on public.jobs for select
  using (get_my_role() = 'manager');

-- JOBS: employees can create jobs for themselves
create policy "jobs: own insert"
  on public.jobs for insert
  with check (auth.uid() = user_id);

-- JOBS: employees can edit their own unlocked jobs
create policy "jobs: own update unlocked"
  on public.jobs for update
  using (auth.uid() = user_id and locked = false);

-- JOBS: employees can delete their own unlocked jobs
create policy "jobs: own delete unlocked"
  on public.jobs for delete
  using (auth.uid() = user_id and locked = false);
```

---

## Step 5 — Deploy the Edge Functions

Edge Functions are small backend scripts that run on Supabase's servers.

### How to deploy a function via the browser

1. In Supabase, go to **Edge Functions** in the left sidebar
2. Click **New function**
3. Name it exactly as shown below
4. Paste the code from the matching file in this repo
5. Click **Deploy**

### Function 1 — `push_approved_to_sheet`

Name: `push_approved_to_sheet`
Code: copy from `supabase/functions/push_approved_to_sheet/index.ts`

### Function 2 — `extract_job_from_image`

Name: `extract_job_from_image`
Code: copy from `supabase/functions/extract_job_from_image/index.ts`

### Disable JWT verification on both functions

For each function, open its settings (gear icon) and turn **Verify JWT** **off**. The functions handle authentication themselves.

---

## Step 6 — Add secrets to Supabase

Secrets are private keys your functions need to work. Go to **Project Settings → Edge Functions → Add new secret** and add each one below.

> **Where to find your Supabase keys:** Project Settings → API

| Secret name | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `APPS_SCRIPT_URL` | From Step 8 below |
| `APPS_SCRIPT_TOKEN` | A password you invent — must match what you set in Apps Script |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — you do not need to add those.

---

## Step 7 — Deploy the frontend on Render

1. Push this repo to your GitHub account
2. Go to [render.com](https://render.com) and sign in
3. Click **New → Static Site**
4. Connect your GitHub repo
5. Render will auto-detect the settings from `render.yaml`. If it doesn't, set:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
6. Add these two environment variables under **Environment**:

| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (Project Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key (Project Settings → API) |

7. Click **Deploy** — Render gives you a public URL when it's done

---

## Step 8 — Set up Google Sheets export (optional)

This lets managers export approved jobs directly to a Google Sheet.

1. Go to [script.google.com](https://script.google.com) and create a **New project**
2. Replace the default code with a `doPost(e)` function that:
   - Validates the `APPS_SCRIPT_TOKEN` from the request body
   - Appends a row to your Google Sheet with the job data
3. Click **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the Web app URL → paste it as `APPS_SCRIPT_URL` in Supabase secrets (Step 6)
5. Set the same token you chose in `APPS_SCRIPT_TOKEN` inside your script

Until this is set up, the **Approve** button will show an error.

---

## Step 9 — Create the first manager account

1. Open your app URL and sign up with an email address
2. Go to Supabase → **Table Editor → profiles**
3. Find the row for that email
4. Change the `role` column from `employee` to `manager`
5. Save

That account now has full manager access. All future signups default to `employee`.

---

## How to run locally (for developers)

```bash
npm install
```

Create a file called `.env.local` in the project root:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then start the app:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## How the app works

### Employee flow

1. Sign up and log in
2. Go to **Form** — fill in the date, work order number, times, and kilometers
3. Or click **Auto-fill from photo** to upload an image of a work order sheet — the app reads it and fills the fields automatically
4. Click **Save** to keep it as a draft, or **Submit** to send it to the manager
5. View past jobs under **History**, weekly totals under **Week**

### Manager flow

1. Log in — you are redirected to the **Manager** dashboard
2. See all submitted jobs from all employees
3. Filter by employee, status, or search by name/OT number
4. Click **Approve** on a job to export it to Google Sheets
5. Use **Approve week** to approve all jobs for an employee in one click

---

## License

Private / Internal Use — All rights reserved.
