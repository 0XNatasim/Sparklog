// supabase/functions/ccq_rates/index.ts
//
// Fetches CCQ wage rates on behalf of the manager.
// Frontend never calls CCQ directly — all traffic goes through this function.
//
// POST body: { occupationId, sectorId, skillId, ratesToDate, annexId? }
// Returns:   { source: "cache"|"ccq", snapshot }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CCQ_BASE = "https://www.ccq.org/api/wagerates/Rates";
const CACHE_TTL_HOURS = Number(Deno.env.get("CCQ_RATES_CACHE_TTL_HOURS") || "24");
const TIMEOUT_MS = Number(Deno.env.get("CCQ_RATES_REQUEST_TIMEOUT_MS") || "10000");

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const supabaseUrl  = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey      = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRole  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // --- Auth: identify caller ---
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!token) return json({ ok: false, error: "Missing bearer token" }, 401);

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await caller.auth.getUser();
    if (authErr || !user) return json({ ok: false, error: "Invalid session" }, 401);

    // --- Auth: require manager role ---
    const admin = createClient(supabaseUrl, serviceRole);
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "manager") {
      return json({ ok: false, error: "Forbidden: manager only" }, 403);
    }

    // --- Parse request body ---
    const body = await req.json().catch(() => ({}));
    const occupationId = String(body.occupationId ?? "220");
    const sectorId     = String(body.sectorId     ?? "C");
    const skillId      = String(body.skillId      ?? "6");
    const annexId      = String(body.annexId      ?? "ALL");
    const ratesToDate  = String(body.ratesToDate  ?? new Date().toISOString().slice(0, 10));

    // --- Cache check ---
    const ttlCutoff = new Date(Date.now() - CACHE_TTL_HOURS * 3_600_000).toISOString();
    const { data: cached } = await admin
      .from("ccq_rate_snapshots")
      .select("*")
      .eq("occupation_id", occupationId)
      .eq("sector_id",     sectorId)
      .eq("skill_id",      skillId)
      .eq("annex_id",      annexId)
      .eq("rates_to_date", ratesToDate)
      .gte("fetched_at",   ttlCutoff)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      return json({ ok: true, source: "cache", snapshot: cached });
    }

    // --- Fetch from CCQ ---
    const ccqUrl =
      `${CCQ_BASE}?ratesToDate=${ratesToDate}` +
      `&occupationId=${occupationId}&sectorId=${sectorId}` +
      `&skillId=${skillId}&annexId=${annexId}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let ccqData: unknown;
    try {
      const res = await fetch(ccqUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "SparkLog/1.0 (ccq-rate-sync)",
          "Accept":     "application/json",
        },
      });
      clearTimeout(timer);

      if (res.status === 404) {
        return json({ ok: false, error: "CCQ: no rates found for this combination", ccqUrl }, 404);
      }
      if (!res.ok) {
        return json({ ok: false, error: `CCQ returned HTTP ${res.status}`, ccqUrl }, 502);
      }
      ccqData = await res.json();
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      return json({ ok: false, error: `CCQ fetch failed: ${msg}`, ccqUrl }, 502);
    }

    // --- Deduplicate by content hash ---
    const rawStr      = JSON.stringify(ccqData);
    const contentHash = await sha256hex(rawStr);

    const { data: existing } = await admin
      .from("ccq_rate_snapshots")
      .select("id, fetched_at")
      .eq("occupation_id",  occupationId)
      .eq("sector_id",      sectorId)
      .eq("skill_id",       skillId)
      .eq("annex_id",       annexId)
      .eq("rates_to_date",  ratesToDate)
      .eq("content_hash",   contentHash)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Content unchanged — bump fetched_at so it stays fresh in cache
      await admin
        .from("ccq_rate_snapshots")
        .update({ fetched_at: new Date().toISOString() })
        .eq("id", existing.id);

      const { data: refreshed } = await admin
        .from("ccq_rate_snapshots")
        .select("*")
        .eq("id", existing.id)
        .single();

      return json({ ok: true, source: "ccq_unchanged", snapshot: refreshed });
    }

    // --- Persist new snapshot ---
    const r = ccqData as Record<string, unknown>;
    const { data: snapshot, error: insertErr } = await admin
      .from("ccq_rate_snapshots")
      .insert({
        occupation_id:   occupationId,
        occupation_name: typeof r.Occupation === "string" ? r.Occupation : null,
        sector_id:       sectorId,
        sector_name:     typeof r.Sector     === "string" ? r.Sector     : null,
        skill_id:        skillId,
        skill_name:      typeof r.Skill      === "string" ? r.Skill      : null,
        annex_id:        annexId,
        rates_to_date:   ratesToDate,
        source_url:      ccqUrl,
        raw_json:        ccqData,
        content_hash:    contentHash,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[ccq_rates] insert error:", insertErr.message);
      // Return data anyway even if storage failed
      return json({ ok: true, source: "ccq", snapshot: { raw_json: ccqData, occupation_name: r.Occupation, sector_name: r.Sector, skill_name: r.Skill } });
    }

    return json({ ok: true, source: "ccq", snapshot });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ccq_rates] unexpected:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
