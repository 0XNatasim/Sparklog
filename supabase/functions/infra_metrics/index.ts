// supabase/functions/infra_metrics/index.ts
//
// Manager-only live infrastructure metrics. Reads Supabase's privileged
// Prometheus metrics endpoint (node_exporter host metrics) with the service-role
// key — something the browser can't do — and returns a small JSON summary:
// CPU %, memory %, disk %, network throughput and disk IOPS.
//
// CPU / network / IOPS are counters, so we scrape twice a few seconds apart and
// take the delta over elapsed time. Memory and disk are gauges (single scrape).
//
// Request (POST, manager bearer token): {}  → { ok, metrics: {...} }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Series = { labels: Record<string, string>; value: number };

// Parse every series of a Prometheus metric name from the exposition text.
function parseSeries(text: string, name: string): Series[] {
  const out: Series[] = [];
  const re = new RegExp(`^${name}(\\{([^}]*)\\})?\\s+([-0-9.eE+]+)`, "gm");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const labels: Record<string, string> = {};
    if (m[2]) {
      for (const pair of m[2].split(",")) {
        const eq = pair.indexOf("=");
        if (eq > 0) {
          const k = pair.slice(0, eq).trim();
          const v = pair.slice(eq + 1).trim().replace(/^"|"$/g, "");
          labels[k] = v;
        }
      }
    }
    const value = Number(m[3]);
    if (Number.isFinite(value)) out.push({ labels, value });
  }
  return out;
}

const sum = (series: Series[], keep: (s: Series) => boolean = () => true) =>
  series.filter(keep).reduce((n, s) => n + s.value, 0);

async function scrape(url: string, auth: string): Promise<string> {
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`metrics endpoint ${res.status}`);
  return await res.text();
}

function memoryPct(text: string): number | null {
  const total = sum(parseSeries(text, "node_memory_MemTotal_bytes"));
  const avail = sum(parseSeries(text, "node_memory_MemAvailable_bytes"));
  if (!total) return null;
  return Math.max(0, Math.min(100, Math.round(((total - avail) / total) * 100)));
}

function diskPct(text: string): number | null {
  const sizes = parseSeries(text, "node_filesystem_size_bytes").filter((s) => s.labels.fstype !== "tmpfs" && s.labels.fstype !== "overlay");
  const avails = parseSeries(text, "node_filesystem_avail_bytes");
  if (!sizes.length) return null;
  // Use the largest real filesystem (the data disk).
  const biggest = sizes.reduce((a, b) => (b.value > a.value ? b : a));
  const avail = avails.find((a) => a.labels.mountpoint === biggest.labels.mountpoint && a.labels.device === biggest.labels.device);
  if (!biggest.value || !avail) return null;
  return Math.max(0, Math.min(100, Math.round(((biggest.value - avail.value) / biggest.value) * 100)));
}

// CPU busy % from two scrapes: 1 - Δidle/Δtotal across all cpus.
function cpuPct(a: string, b: string): number | null {
  const idleA = sum(parseSeries(a, "node_cpu_seconds_total"), (s) => s.labels.mode === "idle");
  const idleB = sum(parseSeries(b, "node_cpu_seconds_total"), (s) => s.labels.mode === "idle");
  const totalA = sum(parseSeries(a, "node_cpu_seconds_total"));
  const totalB = sum(parseSeries(b, "node_cpu_seconds_total"));
  const dTotal = totalB - totalA;
  if (dTotal <= 0) return null;
  const busy = 1 - (idleB - idleA) / dTotal;
  return Math.max(0, Math.min(100, Math.round(busy * 100)));
}

// Rate (per second) of a summed counter between two scrapes.
function ratePerSec(a: string, b: string, name: string, dtSec: number, keep?: (s: Series) => boolean): number | null {
  if (dtSec <= 0) return null;
  const va = sum(parseSeries(a, name), keep);
  const vb = sum(parseSeries(b, name), keep);
  const d = vb - va;
  if (d < 0) return null; // counter reset
  return d / dtSec;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRole) return json({ ok: false, error: "Server env not configured" }, 500);

    // Authenticate the caller and require the manager role.
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return json({ ok: false, error: "Missing bearer token" }, 401);

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: callerUser, error: callerErr } = await caller.auth.getUser();
    if (callerErr || !callerUser?.user) return json({ ok: false, error: "Invalid session token" }, 401);

    const admin = createClient(supabaseUrl, serviceRole);
    const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", callerUser.user.id).maybeSingle();
    if (!callerProfile || !["manager", "owner"].includes(callerProfile.role)) {
      return json({ ok: false, error: "Forbidden: manager role required" }, 403);
    }

    // Scrape the privileged metrics endpoint twice for the counter deltas.
    const metricsUrl = `${supabaseUrl}/customer/v1/privileged/metrics`;
    const basic = "Basic " + btoa(`service_role:${serviceRole}`);
    const t0 = Date.now();
    const first = await scrape(metricsUrl, basic);
    await new Promise((r) => setTimeout(r, 4000));
    const second = await scrape(metricsUrl, basic);
    const dtSec = (Date.now() - t0) / 1000;

    const notLo = (s: Series) => s.labels.device !== "lo";
    const netRx = ratePerSec(first, second, "node_network_receive_bytes_total", dtSec, notLo);
    const netTx = ratePerSec(first, second, "node_network_transmit_bytes_total", dtSec, notLo);
    const iopsR = ratePerSec(first, second, "node_disk_reads_completed_total", dtSec);
    const iopsW = ratePerSec(first, second, "node_disk_writes_completed_total", dtSec);

    const metrics = {
      cpu_pct: cpuPct(first, second),
      memory_pct: memoryPct(second),
      disk_pct: diskPct(second),
      net_bytes_per_sec: netRx == null && netTx == null ? null : (netRx || 0) + (netTx || 0),
      iops: iopsR == null && iopsW == null ? null : Math.round((iopsR || 0) + (iopsW || 0)),
      as_of: new Date().toISOString(),
    };

    return json({ ok: true, metrics });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
