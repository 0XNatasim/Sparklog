import React, { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { BROADCASTS_REFRESH_EVENT } from "@/lib/use-employee-broadcasts";
import { fetchReturnedProofJobs } from "@/lib/returned-proofs";
import { isManagerRole } from "@/lib/roles";
import { useT } from "@/lib/use-t";
import { supabase } from "@/supabaseClient";

// Shown on every page to an employee whose overtime proof was sent back, until the job is submitted again: unlike the message
// (which goes away at « OK »), it stays. The button opens the clock of that work order in History.
export default function ProofReturnedBanner() {
  const t = useT();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const enabled = Boolean(user?.id) && !isManagerRole(role);
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = () => fetchReturnedProofJobs(supabase, user.id).then((rows) => { if (alive) setItems(rows); });
    load();
    window.addEventListener("focus", load);
    window.addEventListener(BROADCASTS_REFRESH_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
      window.removeEventListener(BROADCASTS_REFRESH_EVENT, load);
    };
  }, [enabled, user?.id, location.pathname, location.search]);

  if (!enabled || items.length === 0) return null;
  const first = items[0];
  return (
    <div className="sticky top-0 z-40 border-b-2 border-destructive bg-destructive/10 px-4 py-3 text-destructive" role="alert">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 text-sm font-semibold sm:text-base">
        <TriangleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{items.length === 1 ? t("proofReturned.banner", { ot: first.ot || "—" }) : t("proofReturned.bannerMany", { count: items.length })}</span>
        <Button type="button" size="sm" onClick={() => navigate(`/history?proof=${first.jobId}`)}>{t("proofReturned.bannerOpen")}</Button>
      </div>
    </div>
  );
}
