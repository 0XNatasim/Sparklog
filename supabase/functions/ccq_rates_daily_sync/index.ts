// supabase/functions/ccq_rates_daily_sync/index.ts
//
// Scheduled by pg_cron every morning.
// Pre-populates ccq_rate_snapshots for all sector/skill combinations
// so the Testing tab always has fresh data without a manual sync.
//
// Auth: caller must pass the SUPABASE_SERVICE_ROLE_KEY as Bearer token.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CCQ_BASE       = "https://www.ccq.org/api/wagerates/Rates";
const OCCUPATION_ID  = "220";
const SECTORS        = ["C", "R"];
const SKILLS         = ["6", "4", "3", "2", "1"];
const TIMEOUT_MS     = 12_000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

  try {
    const supabaseUrl   = Deno.env.get("SUPABASE_URL")             ?? "";
    const serviceRole   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Only callable with the service role key
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!serviceRole || token !== serviceRole) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const admin       = createClient(supabaseUrl, serviceRole);
    const today       = new Date().toISOString().slice(0, 10);
    const ttlCutoff   = new Date(Date.now() - 23 * 3_600_000).toISOString(); // 23h TTL for daily runs

    const results: { sector: string; skill: string; source: string }[] = [];
    const errors:  { sector: string; skill: string; error: string  }[] = [];

    // All combinations in parallel
    await Promise.all(
      SECTORS.flatMap((sectorId) =>
        SKILLS.map(async (skillId) => {
          try {
            // Skip if we have a recent snapshot
            const { data: cached } = await admin
              .from("ccq_rate_snapshots")
              .select("id")
              .eq("occupation_id", OCCUPATION_ID)
              .eq("sector_id",     sectorId)
              .eq("skill_id",      skillId)
              .eq("annex_id",      "ALL")
              .eq("rates_to_date", today)
              .gte("fetched_at",   ttlCutoff)
              .limit(1)
              .maybeSingle();

            if (cached) {
              results.push({ sector: sectorId, skill: skillId, source: "cache" });
              return;
            }

            // Fetch from CCQ
            const ccqUrl =
              `${CCQ_BASE}?ratesToDate=${today}` +
              `&occupationId=${OCCUPATION_ID}&sectorId=${sectorId}` +
              `&skillId=${skillId}&annexId=ALL`;

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

            let ccqData: unknown;
            try {
              const res = await fetch(ccqUrl, {
                signal: controller.signal,
                headers: { "User-Agent": "SparkLog/1.0 (ccq-daily-sync)", Accept: "application/json" },
              });
              clearTimeout(timer);
              if (!res.ok) throw new Error(`CCQ HTTP ${res.status}`);
              ccqData = await res.json();
            } catch (e) {
              clearTimeout(timer);
              throw e;
            }

            // Deduplicate by content hash
            const rawStr      = JSON.stringify(ccqData);
            const contentHash = await sha256hex(rawStr);

            const { data: existing } = await admin
              .from("ccq_rate_snapshots")
              .select("id")
              .eq("occupation_id", OCCUPATION_ID)
              .eq("sector_id",     sectorId)
              .eq("skill_id",      skillId)
              .eq("annex_id",      "ALL")
              .eq("rates_to_date", today)
              .eq("content_hash",  contentHash)
              .limit(1)
              .maybeSingle();

            if (existing) {
              await admin.from("ccq_rate_snapshots").update({ fetched_at: new Date().toISOString() }).eq("id", existing.id);
              results.push({ sector: sectorId, skill: skillId, source: "ccq_unchanged" });
              return;
            }

            const r = ccqData as Record<string, unknown>;
            await admin.from("ccq_rate_snapshots").insert({
              occupation_id:   OCCUPATION_ID,
              occupation_name: typeof r.Occupation === "string" ? r.Occupation : null,
              sector_id:       sectorId,
              sector_name:     typeof r.Sector     === "string" ? r.Sector     : null,
              skill_id:        skillId,
              skill_name:      typeof r.Skill      === "string" ? r.Skill      : null,
              annex_id:        "ALL",
              rates_to_date:   today,
              source_url:      ccqUrl,
              raw_json:        ccqData,
              content_hash:    contentHash,
            });

            results.push({ sector: sectorId, skill: skillId, source: "ccq" });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[daily-sync] ${sectorId}/${skillId}:`, msg);
            errors.push({ sector: sectorId, skill: skillId, error: msg });
          }
        })
      )
    );

    console.log(`[daily-sync] done. synced=${results.length} errors=${errors.length}`);
    return json({ ok: true, date: today, synced: results, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[daily-sync] unexpected:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
