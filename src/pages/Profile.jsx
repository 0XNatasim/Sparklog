import React, { useEffect, useState } from "react";
import { BookOpen, ExternalLink, Mail, Phone, UserRound } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPANY_FORMS } from "@/lib/forms";
import { useT } from "@/lib/use-t";

export default function Profile() {
  const t = useT();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      supabase.from("profiles").select("full_name, phone, email").eq("id", user.id).single(),
      supabase.from("employee_forms").select("form_id").eq("enabled", true),
    ]).then(([profileResult, formsResult]) => {
      const loadError = profileResult.error || formsResult.error;
      if (loadError) setError(loadError.message);
      else {
        setProfile(profileResult.data);
        const enabledIds = new Set((formsResult.data || []).map((row) => row.form_id));
        setForms(COMPANY_FORMS.filter((form) => enabledIds.has(form.id)));
      }
      setLoading(false);
    });
  }, [user?.id]);

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t("profile.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("profile.description")}</p>
        </div>
        {loading && <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("common.loading")}</CardContent></Card>}
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {!loading && !error && (
          <>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-primary" />{t("profile.information")}</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <Info label={t("auth.fullName")} value={profile?.full_name} icon={UserRound} />
                <Info label={t("auth.phone")} value={profile?.phone} icon={Phone} href={profile?.phone ? `tel:${profile.phone}` : undefined} />
                <Info label={t("auth.email")} value={profile?.email || user?.email} icon={Mail} href={`mailto:${profile?.email || user?.email}`} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t("profile.forms")}</CardTitle><CardDescription>{t("profile.formsDescription")}</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {forms.map((form) => <a key={form.id} href={form.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg border p-4 font-medium hover:border-primary/50 hover:bg-accent">{form.name}<ExternalLink className="h-4 w-4 text-muted-foreground" /></a>)}
                {forms.length === 0 && <p className="col-span-full text-sm text-muted-foreground">{t("profile.noForms")}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />{t("profile.quickReference")}</CardTitle><CardDescription>{t("profile.quickReferenceDescription")}</CardDescription></CardHeader>
              <CardContent><div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t("profile.noReferences")}</div></CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Info({ label, value, icon: Icon, href }) {
  const content = <span className="break-words font-medium">{value || "—"}</span>;
  return <div className="rounded-lg bg-muted/50 p-4"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>{href && value ? <a href={href} className="text-primary hover:underline">{content}</a> : content}</div>;
}
