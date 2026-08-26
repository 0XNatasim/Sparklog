# Archived migrations

These are the original incremental migrations (`0001`–`0033`). They are kept
here for history only. They have been **superseded by
`../0000_baseline_schema.sql`**, which is a single squashed snapshot of the full
schema they built up to.

They live in this subdirectory so the Supabase CLI does not run them — the CLI
only picks up `*.sql` files directly under `supabase/migrations/`, not nested
folders. Do not move them back.

Going forward, create new schema changes with `supabase migration new <name>`
(they will apply on top of `0000`). Do not edit `0000` for new changes.
