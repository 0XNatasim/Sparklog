// supabase/functions/extract_job_from_image/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const openrouterApiKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";
    if (!openrouterApiKey) {
      return json({ ok: false, error: "Missing OPENROUTER_API_KEY" }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Verify caller is authenticated
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return json({ ok: false, error: "Missing Authorization bearer token" }, 401);
    }

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: callerUserRes, error: callerUserErr } = await caller.auth.getUser();
    if (callerUserErr || !callerUserRes?.user) {
      return json({ ok: false, error: "Invalid session token" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { image_base64, mime_type } = body;

    if (!image_base64) {
      return json({ ok: false, error: "Missing image_base64" }, 400);
    }

    const validMime = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const mediaType = validMime.includes(mime_type) ? mime_type : "image/jpeg";

    const prompt = `You are extracting job/work order data from an image (e.g. a work order sheet, timesheet, or similar document).

Extract the following fields if present in the image:
- job_date: date in YYYY-MM-DD format (convert any date format you find)
- ot: work order number including any prefix exactly as shown (e.g. "OT-169954", not just "169954")
- depart: departure/start time in HH:mm 24h format (often labeled "Heure de début")
- arrivee: arrival time in HH:mm 24h format (often labeled "Heure d'arrivée")
- fin: end/finish time in HH:mm 24h format (often labeled "Heure de fin")
- km_aller: one-way kilometers as a number (often labeled "Distance parcourue", convert "29,00" to 29)

Return ONLY a valid JSON object with these exact keys. Use null for any field you cannot find. No explanation, no markdown.

Example: {"job_date":"2024-12-15","ot":"OT-12345","depart":"07:00","arrivee":"08:30","fin":"16:00","km_aller":45}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterApiKey}`,
        "HTTP-Referer": "https://sparklog.onrender.com",
        "X-Title": "SparkLog OCR",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:${mediaType};base64,${image_base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log("[extract] OpenRouter error:", response.status, errText);
      return json({ ok: false, error: "LLM call failed", detail: errText }, 502);
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content ?? "";

    let extracted: Record<string, unknown> = {};
    try {
      extracted = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        extracted = JSON.parse(match[0]);
      } else {
        return json({ ok: false, error: "Failed to parse LLM response", raw: content }, 500);
      }
    }

    return json({ ok: true, data: extracted });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});