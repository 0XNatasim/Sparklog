# SparkLog

SparkLog is a bilingual, mobile-first time-tracking application for Québec electrical contractors. Employees record daily jobs and supporting evidence; managers review work, manage employee settings, approve time sheets, and prepare CCQ-oriented weekly exports.

> **Documentation current as of V2.4.190 (2026-10-27).** `README.md`, `NOOB.md` (plain-language to-do list) and
> `CLAUDE.md` (detailed tracker) are updated together in every version; `src/lib/docs-sync.test.js` fails when one
> of them does not name the current `APP_VERSION`.

## Roles

Roles are stored lowercase in `profiles.role`:

| Role | Access |
|---|---|
| `employee` | Records and submits their own jobs; sees only their own data. |
| `subcontractor_1` | Sous-traitant-1: uses the employee time-entry workflow but is excluded from DAS payroll calculations and CCQ reports. |
| `manager` | Full manager workspace: review, approve, export, employee settings, costing. |
| `admin` | Administration/office staff. Manager-tier access to every screen **except** NAS/SIN, but **non-CCQ**: paid a flat hourly rate, and excluded from CCQ advantages (no leave indemnity, employer contributions, or meal allowance in costing). |
| `owner` | The company owner — manager-tier **and** privileged (NAS/SIN reveal, role assignment, crown). Replaces the former hard-coded owner/dev accounts, so a fork just marks one account `owner`. |

`get_my_role()` collapses `admin` and `owner` to `manager` for authorization; the raw role drives labels, pay basis, and privilege. Only an **owner** can assign roles (enforced by a DB trigger and an owner-only picker in Manager → Employees).

## Current capabilities

### Employees

- Create, save, edit, and submit daily job cards.
- Record work-order number, date, departure, arrival, end time, mileage, and return-to-storage details.
- Auto-fill a job card from a work-order photo.
- Attach an overtime authorization screenshot when the daily total exceeds eight hours.
  If the upload fails, the message states the real cause (empty/too-large/unsupported or
  unreadable image, timeout, expired session, no network) with the technical detail. An
  expired session, timeout or network drop is retried once automatically after refreshing
  the session, and a **Réessayer avec la même capture** button re-runs the upload with the
  same file without losing the job details.
- Attach parking receipts when the manager enables Parking for that employee: one claim per job, up to
  10 meter receipts picked at once, added or replaced while the claim is pending.
- End-of-day inventory (when enabled): pick several Field Service screenshots at once; the app shows how many
  lines were read against the « N of N » total, and asks whether there are defective products (one more
  screenshot of that section).
- A picture the phone refuses to read (cloud-only photo, screenshot still being saved) is read again up to
  3 times, then a clear message says what to do; the diagnostic (size, file age, step, browser — never the
  picture) goes to the Activity log.
- Review job history and weekly totals. Within each day, jobs are listed in chronological
  order (by departure time, then end time; jobs without a departure last).
- See manager announcements from a **bell icon** in the header: the dropdown lists the latest announcements (unread highlighted, with a count badge); tapping one simply re-opens that notification (no notifications page) and marks it as read. Announcements can carry several photos and PDFs, show « Modifié le … » when a manager edited them, and disappear when withdrawn before being read.
- Complete first-login work-region and union-association onboarding.
- View manager-enabled company forms from the Profile page.
- New profiles default to `compagnon`, CCQ schedule `C3` (general daytime work), a
  `$0.65/km` mileage rate, and a `$7/week` cell-data reimbursement; managers can
  adjust these values per employee.

### Managers

The Manager workspace is a sidebar (a drawer on phones; on desktop it can be shrunk to an icon rail or hidden
entirely with the toggle at the top left of the header); every page has its own URL (`#/manager/…`) and only the
pages a manager is allowed to open are listed. Since V2.4.186 there is one menu (the former « V3 »): the V2 menu and
the V2 | V3 selector are gone, and old V2 addresses (bookmarks, old links) open the matching page and tab.

**Menu** (15 entries; pages with tabs keep each tab's original access rule, the active tab is in `?tab=`):

| Group | Entries [tabs] |
|---|---|
| **Today** (open) | To do [To approve · Receipts & proofs] · Live crew · Notes (private or shared with managers, optional reminder: red badge on « Notes » when due) |
| **Time** | Timesheets [Timesheets · Unlock a day · Days without entry] — employee name first on each card, « Entered by hand » ★ filter |
| **Payroll** (open) | Weekly payroll · Payroll history [Pay stubs · DAS · Record of employment · Detailed calculation] |
| **Team** | Employees [Employees (one card with tabs: identity, CCQ, pay and options, taxes, time off, access) · Time off · Groups] · Inventory · Communications |
| **Reports** | Reports [Costs · Week · Month · By employee (grid) · CCQ export] |
| **Configuration** | Configuration [Settings · CCQ rates · Pay rules · Forms · References · Contacts (with roles)] |
| **Admin** | Travel and expenses (per-employee rules, not yet read by payroll) · Activity log · Service status · Emergency timesheet (owner only) |

The live crew pauses its polling while the browser tab is hidden; CCQ weeks run Sunday→Saturday.

Managers can also broadcast announcements, synchronize CCQ rates, view the app as any employee, and force a manual refresh from the header (useful in installed PWA/App mode).

Other manager features worth knowing (details and versions in `CLAUDE.md` §6.3):

- **Two-factor authentication** is required for owner, manager and admin accounts (authenticator-app code after
  the password); without it the database treats the session as an employee.
- **Employees:** red badge for new sign-ups to activate; three states — Active, **Waiting** (new hire with a first
  day of work, hidden from Live crew and the week view until then) and Inactive; former employees marked « laid
  off » or « no longer works here ».
- **To do / Timesheets:** confirmation before every approve/refuse/delete, « OT already used » anomaly (same work
  order on another job), ★ for jobs entered by hand.
- **Time off:** « Sick » category and a yearly sick-leave register (working days, CSV).
- **Inventory:** defective products, negative quantities with a dismissible alert badge, warehouse total by region.
- **Communications:** several photos and PDFs per message; edit a sent message (with re-read and push) or
  withdraw it for those who have not read it. After each send the manager sees how the phone push went (sent to N
  phones, nobody has notifications on, or refused because the session is closed — then sign in again and « Send again »).
- **Phone notifications on by default** (V2.4.173): every account gets them. When the browser already allows
  notifications the app subscribes the device by itself at start (and moves a shared phone to the person signed in);
  otherwise a blue card at the top asks for the one tap the browser requires (« Turn on », then « Allow »), with
  « Later » for 3 days. The card is shown on phones and tablets only (V2.4.174); on a computer, Profile › Phone
  notifications turns them on. When the browser closes or hides its question (Edge's « quiet » requests), the app
  says how to allow them from the padlock left of the address. Turning them off in Profile is remembered on that device. Employees shows a bell per active
  account (on / not yet) and a « Without notifications » filter (`push_enabled_users`, migration 0113).
- **Employee groups** (V2.4.175, migration 0114): Gestion V3 › Team › **Groups** tab, next to Employees and Absences.
  Create a group (often a warehouse), tick its employees (a person can be in several groups), rename or delete it.
  Communications gets a third choice, **Groups**: tick one or more groups, each active member receives the message
  once. Inventory › Storage can total a **group** as well as a region. Manager-level only (RLS); employees never see groups.
- **New hires waiting to start** (V2.4.175): when « All employees » or a group includes someone whose first day is
  still ahead (account already activated), Communications asks « Send them this message too? » — Yes / No (send to
  the others) / Cancel. No question when there is nobody waiting, or for people ticked one by one.
- **Employee card: dates and personal data** (V2.4.176, migration 0115): a row under phone / email shows the
  birth date, the SIN (moved out of the CCQ section), the **hiring date** (`start_date`: a date still to come keeps the
  person « Waiting to start ») and the **last day worked** (`last_work_date`, new; never before the hiring date; each
  change in the Journal). The Record of employment uses these two dates when they are filled. The CCQ section is now
  called « CCQ data ».
- **Fall time change** (V2.4.177, migration 0116): the night the clocks go back, 1:00-1:59 AM happens twice. A job
  starting or ending in that hour is still refused for the employee, with a plain message to send the hours to the
  manager; the owner enters it in Admin › Emergency timesheet and picks « 1st time (before going back) » or « 2nd time
  (after) ». The employee then confirms it as usual. Pay still counts clock time.
- **Code cleanup** (V2.4.178, no visible change): the time-entry form and the Employees list are split into small
  files (`src/components/employee-form/`, `src/components/employees/`), with screen tests (jsdom + Testing Library,
  `src/test/fake-supabase.js`) written first and passing on both versions. ESLint goes from 64 warnings to 0 and
  `npm run lint` now fails on any warning. Fixed on the way: switching the payroll method (Messier / Reference) now
  recomputes the DAS screen; the service-health card no longer retries a failed load in a loop.
- **Manager V3: plain words, receipts to process, CCQ month** (V2.4.179, V3 only; V2 unchanged): Time › « Reopen a
  day » (was « Unlock a day »), and the time-sheet card button says « Send back for correction » instead of « Unlock ».
  To do › Receipts shows by default only what is left to process (supper or parking claim pending, overtime proof on a
  job not approved yet), with an employee and a day filter; a notification link still opens its job. Reports › CCQ
  export opens on the reporting month that just ended and shows its weeks.
- **Manager V3: one employee card** (V2.4.180, V3 only; V2 unchanged): Team › Employees has a search box (name,
  e-mail, phone, employee or CCQ number, accents ignored) and a « Team leaders » filter. Each open card has tabs:
  **Identity** (number, contact, CCQ card, birth date, SIN, hiring / last day, hiring or departure), **CCQ**
  (classification, region, union, wage schedule, rate), **Pay and options** (flat rate of an office employee, the pay
  rules and reimbursements of Time rules, team-leader premiums, parking receipts and inventory screenshots), **Taxes
  (TD1)** (TD1 / TP-1015.3, fixed pay, EI / QPP exemptions; managers and owner only), **Time off** and **Access** (role,
  active / paused, Gestion sections, two-factor and phone notifications, view as, delete). Same fields and same saves as
  before. V3 Configuration no longer has the Time rules tab nor the employees' TD1 forms in Settings.
- **Costs and Week / Month use the payroll calculation** (V2.4.181, V2 and V3): Reports › Costs and Week / Month now
  add up, week by week, the same figures as the pay stubs and the printed weekly summary — hours, gross pay, 13%,
  statutory employer contributions (QPP, EI, QPIP, FSS, CNT, CNESST, FDRCMO) and CCQ employer benefits computed by the
  payroll engine, with each employee's TD1, exemptions and year-to-date — instead of a separate per-hour formula.
  Office, owner and subcontractors stay at their hourly rate without contributions; jobs returned for correction now
  count, drafts never.
- **Manager V3: small extras** (V2.4.182):
  - **To do** shows in the menu the number of submitted jobs waiting for approval (one count-only request on each page
    change and after each approval).
  - **Time › Days without entry**: the completed work days with no job entered, per employee, with the dates and a link
    to the person's time sheets. Weekends and CCQ holidays never count any more, here and in Journal › Employees, where
    they used to be added.
  - **Communications**: search boxes in the employee picker and in « Sent notifications » (text or recipient).
  - **One bell** in V3 (manager notifications, plus the person's messages for someone who is not a manager) and
    **Mark all as read** on the manager notifications (V2 bell too).
- **Gestion V3 by default** (V2.4.183): Gestion opens in V3 for everyone (office admins too, who saw only V2 before;
  each tab keeps its access rule). The V3 bell opens the V3 pages (To do › Receipts, Team › Employees).
- **V2 removed** (V2.4.186): one menu, no V2 | V3 selector. An old V2 address (`#/manager/timesheets`,
  `payroll/das`, `config/rules`…) opens the page and tab that hold it now, with its filters (employee, day, method…).
- **Inventory: who is away** (V2.4.187): an employee on full-day time off that day (leave, vacation, absence, sick,
  part-time schedule) who sent no list is shown greyed at the bottom (« Absent · Vacation »…) and not counted in
  « received / expected ». Paused or former accounts and new hires before their first day are no longer listed
  (unless they sent screenshots).
- **Inventory: unreadable lines must be retaken** (V2.4.188, migration 0117): a Field Service row cut at the edge
  of a screenshot (code read, quantity not) is kept as « unreadable » instead of being dropped. At the end of the
  shift the employee sees which line(s) could not be read (and, for lines not read at all, the probable names from
  their previous list) and must send one more « complément » screenshot showing them before « Continue »; if the
  lines are still unreadable after it, « Continue anyway » (the manager checks the photos). Managers see
  « unreadable » on the line and the extra screenshot in the Photos tab.
- **Employee list on a phone** (V2.4.184): each employee's name is on its own line and never cut; the state, missing
  fields and region badges go on the line below. The search box takes the full width on a phone.
- **Employees in no group** (V2.4.185): Team › Groups lists the active field employees (and new hires waiting to start)
  who are in no group (warehouse), with an « Add to… » picker to put each one in a group. Office staff, managers, the
  owner and paused accounts are not listed.
- **Replies on shared notes** (V2.4.190, migration 0118): under a shared note (Today › Notes) the managers answer each
  other like in a chat: my replies on the right in green, the others' on the left in blue with their name. A reply
  written since I last opened Notes is marked « Nouveau », its note comes first with « N nouvelle(s) réponse(s) », and
  it counts in the red badge on « Notes » in the menu (checked every 2 minutes). Each person may remove their own reply;
  replies are never edited. Private notes have no conversation. In the app only (no phone notification).
- **Sign out** closes the session of this device only; the same account stays signed in on the other devices
  (changing the password still signs out everywhere).
- **Payroll:** weekly payroll page, Dynacom cumulatives locked up to week 42, fixed pay, EI/RRQ exemptions,
  « Messier » method by default, printable weekly summary.

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
- ESLint 10 (`npm run lint`, run in CI, no warning allowed), Vitest and Testing Library (screen tests in jsdom)

## Repository layout

```text
src/
  components/       Shared UI and manager panels (LiveCrew, JobCard, ErrorBoundary, …)
  contexts/         Authentication/profile state
  lib/              CCQ export/rate helpers, i18n, job contract, time helpers
  pages/            Employee pages and the lazily loaded manager pages
  payroll/          DAS test-bench engine, CCQ benefit layer, 2026 rule constants
supabase/
  functions/        Server-side integrations (the shared payroll engine lives in _shared/)
  migrations/       Incremental database, RLS, Storage, and cron changes
docs/               ADRs, payroll rules and sources, security matrix, ops notes
tests/              Official reference PDFs (CCQ tables, T4127, TP-1015.F) and the RLS suite
public/             Static images (WebP) and the push service worker
```

## Prerequisites

- Node.js 20.19 or newer (required by ESLint 10; CI uses Node 20)
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

Check and build (the same three steps CI runs on every pull request):

```bash
npm run lint    # ESLint — 0 errors and 0 warnings (--max-warnings=0)
npm test        # Vitest — payroll parity fixtures, WCAG theme contrast, screen tests (*.test.jsx, jsdom)
npm run build
```

The Vite development server normally runs at <http://localhost:5173>.

## Supabase setup

SparkLog expects Supabase Auth plus the base `profiles` and `jobs` tables. Existing installations should apply every migration in `supabase/migrations` in filename order. Each file is named `<version>_<name>.sql` with the version recorded in the production migration history; name new migrations with a UTC timestamp version (`YYYYMMDDHHMMSS_name.sql`) so they sort after existing ones. The migrations add and configure:

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

Employee `jobs` policies (create a draft, create an already-submitted job, or move an
unlocked draft to the locked `submitted` state) are installed by the migrations, and
migration `0018_paused_employee_write_containment.sql` additionally blocks **all**
employee writes while an account is paused and replaces the profile-field blacklist with
an explicit employee-editable whitelist. Migrations are written to be safe to re-run.

After migrations, set the first **owner** manually (the owner is the privileged tier and
the only role that can assign other roles, so bootstrap it directly in SQL):

```sql
update public.profiles
set role = 'owner'
where email = 'owner@example.com';
```

Use `role = 'manager'` for additional supervisors, `role = 'admin'` for non-CCQ
administration staff, and `role = 'subcontractor_1'` for subcontractors who enter time
but must stay outside DAS and CCQ reports. Once an owner exists, roles can be assigned
from Manager → Employees.

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
supabase functions deploy create_employee
supabase functions deploy reset_employee_password
supabase functions deploy delete_user
supabase functions deploy send_push
supabase functions deploy infra_metrics
supabase functions deploy process_inventory_screenshot
supabase functions deploy delete_inventory_screenshots
```

| Function | Purpose |
|---|---|
| `push_approved_to_sheet` | Approves/exports one job through Google Apps Script. |
| `push_approved_batch` | Approves/exports a group of jobs. |
| `send_announcement` | Persists and emails manager announcements. |
| `ccq_rates` | Authenticated proxy/cache for CCQ commercial electrician rates. |
| `ccq_rates_daily_sync` | Service-role-only refresh of commercial rate snapshots. |
| `classify_week` | Authoritative payroll classification (M4): reads an employee's jobs server-side and returns the versioned `computeWeek()` result (per-job trace, per-week regular/OT50/OT100, engine version, warnings). Manager-only. Shares one engine with the client via `supabase/functions/_shared/payroll_engine.js` (parity-tested). |
| `process_overtime_evidence` | Background OCR of overtime authorization screenshots (ocr.space). |
| `cleanup_overtime_evidence` | Service-role-only deletion of expired overtime images and records. |
| `delete_user` | Manager-only hard delete of an inactive account, with guards and an audit-log entry. |
| `create_employee` | Manager/owner creation of an already-confirmed employee account with an optional generated temporary password. |
| `reset_employee_password` | Manager/owner generation of a new one-time-displayed temporary password without deleting payroll history. |
| `send_push` | Web push for announcements (and the « Message modifié » re-read push). |
| `infra_metrics` | Manager-only service status (database, storage, connections). |
| `process_inventory_screenshot` | Server-side reading (OCR) of inventory screenshots into equipment lines, including defective products and negative quantities. |
| `delete_inventory_screenshots` | Manager removal of an inventory screenshot (file, lines and row together). |

Every manager-level function also checks the two-factor (`aal2`) claim (`_shared/mfa.js`).

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

Rules are recorded as data in the `public.payroll_rules` table and documented in
`docs/rules/compensation-rules.md` (with their CCQ sources). Highlights:

- **Overtime.** Regular hours are capped at 8 h/day; time worked past 8 h in a day is
  overtime. The **first hour of overtime in the week** is paid at 1.5×; all further
  overtime that week is at 2×. The 1.5× allowance is **weekly, not per day**.
- **Saturday, Sunday, holidays.** Saturday is all overtime (the week's 1.5× hour if still
  unused, then 2×); Sunday and statutory holidays are 2× from the first hour. Statutory
  holidays and the CCQ construction vacation weeks block employee job entry (`company_holidays`).
- **Day rounding** (from week 42, 2026-10-04). Each day (work + return) is paid to the
  nearest 15 minutes, with a per-employee running counter so the rounding never drifts
  (`docs/rules/compensation-rules.md`, DAY_ROUNDING).
- **Fixed weekly pay and EI exemption.** An employee can be paid fixed hours every week at
  their hourly rate, with or without jobs, and/or be exempt from EI (> 40 % of the voting
  shares) — Settings › Payroll, per employee. Used for the owner (40 h × $51, stub D0038-0002).
- **Leave indemnity.** The CCQ **leave indemnity — 13 % of weekly gross wages** (6 %
  vacation + 5.5 % statutory holidays + 1.5 % sick) — is paid by the employer *on top of*
  wages and shown as an employer cost in the costing dashboard; it is **not** deducted
  from the worker.
- **Costing = real employer cost (estimate).** The costing dashboard reports actual wages
  (using the rate **frozen on each job at submission**, so a later rate change never
  rewrites past costs) + the 13 % indemnity + **employer contributions** + km/meals/parking,
  with a foldable per-row breakdown. Employer contributions are per-hour amounts **by CCQ
  level** (EI, RQAP, RRQ, F.S.S., avantages sociaux, taxe assurances, CCQ, AECQ+ACQ, fonds
  divers, équipement, autres, CNESST), seeded from the ACQ grid and editable by a manager
  in the settings panel above the table (`employer_contributions`). It stays a labeled
  estimate (statutory annual maximums are not modelled). `admin` (non-CCQ) staff are costed
  at wages + km/parking only — no indemnity, contributions, or meal allowance.
- Job kilometres from image autofill or manual entry are the **total shown on the work order**. If an employee records a return to storage, the return kilometres are subtracted from that total to produce the client leg; they are never added a second time.
- Return-to-storage time is inside the day's paid span but is **never overtime** and does not count toward the 8 h (Messier rule, 2026-10-13). By default it is paid at the base rate **without social benefits**. For employees with **"Return time with social benefits up to 8h"** (Time rules), it keeps its benefits while work + return stays within 8 h; only the part beyond is paid without benefits. Subcontractors: always the base rate. The meal and >8 h overtime-proof thresholds still count it.
- A supper claim becomes available after **2 h 15 of overtime, i.e. 10 h 15 of work** in the day; return-to-shop time (and an unpaid first trip) never counts. It is fixed at $30, limited to one per employee/day, requires a receipt and manager approval, and the manager classifies it as an expense reimbursement or taxable payroll benefit.
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

## App updates (PWA)

Every build emits `/version.json` (generated from `APP_VERSION` in `src/lib/version.js`,
never precached by the service worker). `UpdateBanner` checks it on load, on focus and
every 5 minutes and offers a **Rafraîchir maintenant** button. In addition, `main.jsx`
applies a newly installed service worker only when the tab goes to the background, so a
form in progress is never reloaded under the user. Pages are code-split: if a deploy
removed a file an open tab still needs, the app reloads **once** (guarded against loops).
Every chunk is precached, so the installed app opens and navigates fully offline.
Always bump the patch of `APP_VERSION` in every PR (it is shown in the header as `V…`).

## Interface and accessibility

- Colours are theme tokens in `src/index.css` (`primary` = Messier green, `success` = teal,
  `warning`, `info`, `destructive`), light and dark. `src/lib/theme-contrast.test.js` fails
  the build if any token drops below WCAG contrast (4.5:1 text, 3:1 field borders).
  Use the tokens instead of Tailwind palette colours (`text-success`, not `text-green-600`).
- Phone header: 44 px touch targets; secondary actions live in the ⋮ menu.
- Root, route and manager-panel error boundaries replace a blank screen with a
  recoverable error; the employee's draft is kept in IndexedDB.

## Reliability (free-tier keep-warm)

SparkLog must be usable by managers at any hour. On the Supabase free tier two layers
keep it responsive despite cold starts:

- **Client auto-retry** — `withRetry` (`src/lib/utils.js`) retries a stalled read a few
  times with backoff before surfacing an error, so a cold start self-heals.
- **24/7 keep-warm** — `.github/workflows/keep-warm.yml` pings the `public.ping()` RPC
  every ~10 minutes so Postgres never goes cold. Requires repo secrets `SUPABASE_URL`
  and `SUPABASE_ANON_KEY`, and runs only from the default branch.

This is best-effort, not an SLA. When uptime becomes critical, move to **Supabase Pro**
(no pausing, steadier compute, daily backups). See `docs/ops/supabase-reliability.md`.

## Payroll DAS engine (Manager → Payroll → Calculation)

A deterministic, pure source-deductions (DAS) engine lives under `src/payroll/` and is
exercised from the **Payroll → Calculation** bench. It is a **test bench only** — every
result is labeled *"Not finalized payroll · Requires payroll review"* and the rule set
stays `draft` (`requires_review = true`) until validated against WebRAS/PDOC with
specialist sign-off (per the payroll-rule gate). Money is computed in integer cents.

- **Statutory deductions** — federal income tax (CRA T4127 Option-1 formula, Québec
  abatement), Québec income tax (TP-1015.F), RRQ two-tier, EI (Québec rate), RQAP,
  plus employer FSS/CNT/FDRCMO/CNESST. 2026 RRQ/RQAP and the RRQ 5,30 % / 1,00 % base
  vs. enhancement split are confirmed against the Revenu Québec 2026 tables; the RRQ
  enhancement is deducted from taxable income (T4127 factor F5A / TP-1015.F).
- **CCQ layer** (`src/payroll/ccq-benefits.js`) — folds collective-agreement items into
  the right bases *before* the tax engine (électricien, annexe C3): 13 % vacation
  indemnity (pensionable/insurable), the MÉDIC *avantage imposable* (3,377 $/h — CCQ
  Avantages imposables table; Québec-taxable + pensionable but excluded from the federal
  source base → T4A), the employee pension contribution (wage × 1,13 × 9 %, deductible),
  the MÉDIC premium withholding, and **union dues** auto-computed per union
  (`CCQ_UNIONS`: FTQ-FIPOE, International/FIPOE 568, CSD, CSN, SQC) as a federal U1
  deduction / Québec credit.
- **Validation status** — against a real compagnon-électricien stub, RRQ/EI/RQAP and
  Québec income tax reproduce to the cent; federal lands ~1,50 $ from the printed
  withholding (the CCQ *prélèvement* is not a federal deduction; residual is
  TD1/rounding), to settle against PDOC. Constants and their sources are registered in
  `docs/rules/2026-das-payroll.md`.

### What is still missing before finalized payroll

Hours classification is in production. The **dollar amounts** stay an estimate until:

1. **Remaining rules are confirmed** — the ICI collective agreement, the CCQ benefit and levy
   rates and the CNT figures are received and cited (`docs/rules/compensation-rules.md`); still
   open: which wages the CNESST premium applies to (the "admissible" wage), union locals.
2. **Company figures are entered** — the CNESST rate is entered; the 2026 payroll total
   (FDRCMO threshold and FSS rate) is still to be entered.
3. **Employee forms are recorded** — each employee's TD1 and TP-1015.3 (personal credits),
   union and local, apprenticeship period.
4. **3–5 real pay stubs reproduce to the cent** in WebRAS and PDOC (apprentice, overtime,
   supper/parking, team leader).
5. **A named payroll/CCQ specialist signs off**, then `RULE_VERSION.status` becomes
   `validated`.

The itemised, up-to-date list is in `CLAUDE.md` §6.1.

## Governance & documentation

Payroll-adjacent work follows a scope-and-rule discipline (see `GPT.md` and the `docs/`
tree):

- `docs/adr/` — product-scope decision: SparkLog is a **timekeeping + payroll-export**
  tool, not a payroll engine. Every calculated value stays labeled as an estimate /
  preview until a qualified specialist validates it.
- `docs/rules/` — approved compensation rules with their CCQ sources (system of record:
  the `payroll_rules` table).
- `docs/governance/OWNERSHIP.md` — named owners and approval gates.
- `docs/security/authorization-matrix.md` — the enforced RLS matrix, plus the runnable
  adversarial suite at `tests/rls/authorization_matrix.sql`.
- `docs/inventory/` — every calculation and export surface.
- `.github/pull_request_template.md` — a required payroll-rule gate: no new pay rule
  merges without a cited source and specialist approval.

## Security notes

- Never expose the Supabase service-role key in frontend environment variables.
- Treat all `VITE_*` variables as public.
- Keep overtime and parking buckets private.
- Preserve RLS policies and manager-only profile-setting triggers.
- Pausing an account blocks employee access without deleting historical jobs or evidence.
- **NAS/SIN is vaulted.** Each NAS is a Supabase Vault secret (encrypted, key outside the database, migration 0102); `employee_sensitive` keeps only the secret id and has no table policy for the browser. Only the owner-only RPCs `reveal_nas` / `set_nas` / `nas_presence` / `export_ccq_nas` reach it, each audited; `set_nas` rejects a bad check digit. Other managers and `admin` staff only see a mask. Wage information is sensitive; restrict access and production logs accordingly.
- **Two-factor authentication** (migration 0103): `get_my_role()` returns `manager` and `is_privileged()` is true only for an `aal2` session, so a stolen password alone opens neither Gestion nor NAS data.

## License

Private / Internal Use — All rights reserved.

---

## CCQ monthly-report field-verification checklist

Before the **first** monthly report is sent to the CCQ, every value that feeds
the export must be confirmed — the app can warn when a field is *empty*, but it
cannot know whether a filled-in value is *correct*. Work through this list with
the person responsible for payroll/CCQ (the "approver" column).

The CCQ monthly report is due **by the 15th of the month following** the work
period, so this verification can happen after the crew starts recording hours —
it does not block time-sheet go-live.

> Legend: **✓** = confirmed correct · **✗** = needs fixing · note the correction.

### 1. Per-employee data (repeat for each active employee)

Confirmed in **Manager → Employees**. Source of truth is the employee's CCQ
*certificat de compétence*.

| Field | App field | Where it appears on the report | ✓ / ✗ | Correction / notes |
|---|---|---|---|---|
| Full name | `full_name` | Identification (D) — any error rejects the line | | |
| Social insurance number (NAS) | `nas_employee` | Identification (D) | | |
| Work region | `work_region` | Région de travail (K) — confirm against current CCQ region list | | |
| Appendix / annexe | `wage_schedule` | Annexe/Salaire (J), exported as `C-3` | | |
| Union association | `union_association` | Union/syndicat (L) — FTQ/International also need the **local** number | | |
| Hourly rate | `hourly_rate` | Taux horaire — must match the confirmed annexe | | |
| Apprenticeship level | `apprentice_level` | Période d'apprentissage (F) | | |

### 2. Global assumptions (confirm once)

| Assumption | Current value | Confirm |
|---|---|---|
| Occupation / trade | Électricien `220` | |
| Sector | Institutionnel & commercial → `C` | |
| Week ending | Saturday | |
| Everyone reported as regular salaried worker (blank status) | yes | |
| Statutory holidays / construction vacations | **handled** — non-working (entry blocked via `company_holidays`); 13 % leave indemnity computed | |

### 3. Rates to verify against current CCQ / ACQ tables

Wage and benefit rates are fetched from the CCQ rate snapshot; the flat
contributions and the union-specific dues are **not yet computed by the app**
(planned for the remittance stage) and must be verified against the current
official tables before any dollar figure is trusted.

| Rate | Source | Confirm current value |
|---|---|---|
| Regular / 150% / 200% hourly rates | CCQ rate sync (`ccq_rate_snapshots`) | |
| Avantages sociaux ($/h) | CCQ rate sync | |
| Congés & jours fériés (13 % = 6 % vac + 5.5 % fériés + 1.5 % maladie) | CCQ chèque-vacances — **confirmed** | |
| Prélèvement CCQ: **0.75 %** employee share + 0.75 % employer share (ACQ grid, 26 Apr 2026, note 10) — team-leader premium in/out of the base still to confirm | CCQ | |
| Contribution sectorielle ($0.02/h) | CCQ | |
| Fonds d'indemnisation ($0.02/h) | CCQ | |
| Fonds de formation ($0.20/h) | CCQ | |
| AECQ ($0.03/h + $225 annual, October) | AECQ | |
| TPS / TVQ | Federal / Québec (TVQ is 9.975 %) | |
| **Union dues — per union / local** | Table des taux de cotisation syndicale | |

### 4. Union differences to resolve

Dues and, in some cases, benefit handling differ by union (CSD, CSN, SQC,
FTQ‑Construction, International/CPQMCI). List each union present in the crew and
its confirmed dues rate (and local, for FTQ/International):

| Union | Local (if applicable) | Dues rate | Confirmed by |
|---|---|---|---|
| | | | |

### 5. Sign-off

- [ ] All 10 employee records confirmed
- [ ] Global assumptions confirmed
- [ ] Current rates confirmed
- [ ] Union differences resolved

Approved by: _________________  Date: _________

> This export is an integration-ready internal format, **not** a certified CCQ
> submission file. Validate against the CCQ's current requirements before use in
> production payroll.
