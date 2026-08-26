# SparkLog

SparkLog is a bilingual, mobile-first time-tracking application for Québec electrical contractors. Employees record daily jobs and supporting evidence; managers review work, manage employee settings, approve time sheets, and prepare CCQ-oriented weekly exports.

## Current capabilities

### Employees

- Create, save, edit, and submit daily job cards.
- Record work-order number, date, departure, arrival, end time, mileage, and return-to-storage details.
- Auto-fill a job card from a work-order photo.
- Attach an overtime authorization screenshot when the daily total exceeds eight hours.
- Attach a parking receipt when the manager enables Parking for that employee.
- Review job history and weekly totals.
- Complete first-login work-region and union-association onboarding.
- View manager-enabled company forms from the Profile page.

### Managers

The Manager workspace is divided into six sections:

| Section | Purpose |
|---|---|
| **Employees** | Edit employee/CCQ metadata, choose the commercial appendix, enable Parking, configure storage/return-time options, and pause accounts without deleting history. |
| **Forms** | Open company forms and control which forms employees can see. |
| **Time-sheet** | Review submitted jobs, unlock entries, and approve jobs before Google Sheets export. |
| **Overtime** | Review overtime jobs and the original authorization screenshot. |
| **Parkings** | Review parking jobs and display their receipt pictures. |
| **Download** | Preview and download CCQ-oriented weekly JSON records. |

Other manager tools include announcements, CCQ rate synchronization, employee filtering, and bulk weekly approval.

## CCQ assumptions

The current deployment is intentionally limited to:

- **Occupation:** Electrician (`220`)
- **Sector:** Institutional and Commercial (`I` in exports; `C` for the CCQ wage-rate endpoint)
- **Week ending:** Saturday

Approved daily jobs are preserved as source records. The Download section aggregates them by employee, Saturday week-ending date, trade, sector, region, and appendix, with separate regular, 50% overtime, and 100% overtime totals.

> The JSON exporter is an integration-ready internal format, not a guarantee of direct CCQ acceptance. Validate overtime, statutory-holiday, appendix, and submission rules before production payroll use.

## Work-order image autofill

SparkLog does **not** use an LLM, OpenRouter, Claude, GPT, or another generative-AI service for image extraction.

Work-order autofill sends the selected image to [ocr.space](https://ocr.space/ocrapi) from the browser and falls back to local `tesseract.js` processing if necessary. SparkLog parses the extracted work-order text into job fields.

The former LLM/Vision Edge Function has been removed. No `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, or other LLM credential is needed.

Parking receipt pictures and overtime proof screenshots are stored as images without text extraction. Overtime screenshots are removed according to the configured evidence-retention period.

## Technology

- React 18 and Vite
- Tailwind CSS and Radix-based UI components
- Supabase Authentication, Postgres, Row Level Security, Storage, Realtime, and Edge Functions
- Vercel as the primary static host; Render is also configured
- `dayjs` for date/week calculations
- ocr.space with an in-browser Tesseract fallback

## Repository layout

```text
src/
  components/       Shared UI and manager panels
  contexts/         Authentication/profile state
  lib/              CCQ export/rate helpers, i18n, and static lists
  pages/            Employee, manager, history, profile, week, and testing pages
supabase/
  functions/        Server-side integrations and scheduled maintenance
  migrations/       Incremental database, RLS, Storage, and cron changes
public/              Static instructional images
```

## Prerequisites

- Node.js 18 or newer
- npm
- A Supabase project
- A Vercel or Render project
- An ocr.space API key for reliable OCR
- A Google Apps Script endpoint if Google Sheets approval/export is enabled
- Optional Resend or Brevo credentials for real announcement emails

No LLM account or API key is required.

## Local development

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_OCR_SPACE_API_KEY=your-ocr-space-key
```

The `process_overtime_evidence` Edge Function also expects an `OCR_SPACE_API_KEY` Supabase secret for background overtime processing.

`VITE_OCR_SPACE_API_KEY` is technically optional because the code uses ocr.space's public `helloworld` key when absent, but that key is heavily rate-limited and should not be used for production.

Start the application:

```bash
npm run dev
```

Build the production bundle:

```bash
npm run build
```

The Vite development server normally runs at <http://localhost:5173>.

## Supabase setup

SparkLog expects Supabase Auth plus the base `profiles` and `jobs` tables. Existing installations should apply every migration in `supabase/migrations` in filename order. The migrations add and configure:

- Manager job-update policies and dashboard indexes
- CCQ numbers, classifications, snapshots, profile metadata, and scheduled rate synchronization
- Company-form visibility
- Storage and return-trip fields
- Overtime evidence, manager notifications, private Storage, and cleanup retention
- Employee pause state and union association
- Commercial-only sector and electrician-only occupation constraints
- Parking receipts, private Storage, and employee-specific Parking permission

With the Supabase CLI linked to the target project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

For a fresh project, create the base schema and policies first or restore them from an existing SparkLog database before running these incremental migrations. At minimum:

- `profiles.id` must reference `auth.users.id` and include `role`, `full_name`, `email`, and `phone`.
- `jobs` must include the employee, date, job fields, status, locked/export state, and timestamps.
- `public.get_my_role()` must return the authenticated profile role.
- Employees must be allowed to manage their own unlocked jobs; managers must be allowed to read profiles/jobs and update jobs.

Migration `0029_employee_job_submission_policies.sql` installs the employee
`jobs` policies explicitly. It allows an employee to create a draft, create a
job already submitted, or transition an unlocked draft to the locked
`submitted` state. The migration is safe to push if its SQL was previously run
manually in the Supabase SQL editor.

After migrations, set the first manager manually:

```sql
update public.profiles
set role = 'manager'
where email = 'manager@example.com';
```

## Private evidence storage

Migrations create two private buckets:

- `overtime-evidence`
- `parking-receipts`

Employees can upload only under their own user-ID folder. Managers receive read access through RLS and the UI creates short-lived signed URLs only when an image is requested. Do not make either bucket public.

## Edge Functions

Deploy the functions used by your environment:

```bash
supabase functions deploy push_approved_to_sheet
supabase functions deploy push_approved_batch
supabase functions deploy send_announcement
supabase functions deploy ccq_rates
supabase functions deploy ccq_rates_daily_sync
supabase functions deploy cleanup_overtime_evidence
```

| Function | Purpose |
|---|---|
| `push_approved_to_sheet` | Approves/exports one job through Google Apps Script. |
| `push_approved_batch` | Approves/exports a group of jobs. |
| `send_announcement` | Persists and emails manager announcements. |
| `ccq_rates` | Authenticated proxy/cache for CCQ commercial electrician rates. |
| `ccq_rates_daily_sync` | Service-role-only refresh of commercial rate snapshots. |
| `cleanup_overtime_evidence` | Service-role-only deletion of expired overtime images and records. |

The frontend sends authenticated bearer tokens to user-facing functions. Keep normal JWT verification/authentication behavior aligned with each function's own authorization checks; do not expose service-role credentials to the browser.

## Supabase function secrets

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Configure only the integrations you use:

| Secret | Required for |
|---|---|
| `APPS_SCRIPT_URL` | Google Sheets job export |
| `APPS_SCRIPT_TOKEN` | Shared authentication secret for Apps Script |
| `RESEND_API_KEY` + `RESEND_FROM` | Resend announcement email provider |
| `BREVO_API_KEY` + `BREVO_FROM_EMAIL` | Brevo announcement email provider |
| `BREVO_FROM_NAME` | Optional Brevo sender name |
| `CCQ_RATES_CACHE_TTL_HOURS` | Optional CCQ cache override |
| `CCQ_RATES_REQUEST_TIMEOUT_MS` | Optional CCQ request-timeout override |

If neither email provider is configured, announcements use the built-in mock provider: records are created, but no real email is sent.

## Google Sheets integration

The approval functions expect a Google Apps Script web app that:

1. Accepts the approved job payload.
2. Verifies `APPS_SCRIPT_TOKEN`.
3. Appends the job to the correct Google Sheet.
4. Returns a successful JSON response.

Store its deployed URL and shared token as Supabase secrets. Never put the Apps Script token in a `VITE_` variable because Vite variables are public in the browser bundle.

## Deployment

### Vercel

1. Import the repository.
2. Select the Vite framework preset.
3. Use `npm run build` and output directory `dist`.
4. Add the three frontend variables from `.env.local`.
5. Deploy.

`vercel.json` supplies SPA rewrites and cache headers.

### Render

Connect the repository as a static site. `render.yaml` uses `npm run build`, publishes `dist`, and rewrites application routes to `index.html`.

## Operational workflows

### Confirmed payroll and expense rules

- Job kilometres from image autofill or manual entry are the **total shown on the work order**. If an employee records a return to storage, the return kilometres are subtracted from that total to produce the client leg; they are never added a second time.
- Return-to-storage time is always regular-rate paid time. It never creates overtime, including when the workday is already longer than eight hours.
- A weekday supper claim becomes available at exactly 2 h 15 of overtime. It is fixed at $30, limited to one per employee/day, requires a receipt and manager approval, and the manager classifies it as an expense reimbursement or taxable payroll benefit.
- Parking is enabled per employee, requires an amount and receipt, and is capped at $20 per employee/day.
- Employee job entry uses `America/Toronto`. The full configured deadline minute is accepted (the default `23:59` blocks at midnight); CCQ construction vacations and statutory holidays are installed automatically by dated migrations, and managers can unlock a specific employee/date.
- Birth dates and CCQ card expiration dates are stored as full dates and maintained by managers.
- The general travel-rate conversion rule from the original planning document is **deferred and is not implemented**.

### Employee job lifecycle

1. Employee creates or auto-fills a job.
2. Optional employee-specific Parking control requests a receipt picture.
3. Return travel and mileage are recorded.
4. If the daily total exceeds eight hours, an overtime authorization screenshot is required.
5. Employee saves a draft or submits a locked job. Managers are notified when the proof is first uploaded and again if the employee later edits that job after it is unlocked.
6. Manager reviews and approves it.

### Manager onboarding checklist

1. Apply all database migrations and deploy required Edge Functions.
2. Create/promote a manager profile.
3. Complete employee CCQ metadata in Manager → Employees.
4. Enable Parking only for employees who need it.
5. Configure the global overtime evidence-retention period.
6. Synchronize commercial CCQ rates and select the correct appendix.
7. Configure Google Sheets and an email provider if those integrations are required.

## Security notes

- Never expose the Supabase service-role key in frontend environment variables.
- Treat all `VITE_*` variables as public.
- Keep overtime and parking buckets private.
- Preserve RLS policies and manager-only profile-setting triggers.
- Pausing an account blocks employee access without deleting historical jobs or evidence.
- Social insurance numbers and wage information are sensitive; restrict manager access and production logs accordingly.

## License

Private / Internal Use — All rights reserved.
