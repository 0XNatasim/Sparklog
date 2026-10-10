import React, { useCallback, useEffect, useState } from "react";
import { BookOpen, Building2, ChevronDown, ClipboardList, ExternalLink, Mail, MapPin, Phone, UserRound, Users } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ReferenceContent from "@/components/ReferenceContent";
import { useLanguage } from "@/components/language-provider";
import { directLink } from "@/lib/reference-blocks";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { useT } from "@/lib/use-t";
import { QUEBEC_REGIONS } from "@/lib/ccq-regions";
import { UNION_ASSOCIATIONS } from "@/lib/union-associations";
import { useViewMode } from "@/contexts/ViewModeContext";
import CcqCardCapture from "@/components/CcqCardCapture";
import PushNotificationsToggle from "@/components/PushNotificationsToggle";
import { isOwnerRole } from "@/lib/roles";
import { Radio } from "lucide-react";

export default function Profile() {
  const t = useT();
  const { user, role } = useAuth();
  const { isViewMode, viewedEmployee } = useViewMode();
  const effectiveUserId = isViewMode ? viewedEmployee.id : user?.id;
  const [profile, setProfile] = useState(null);
  const [forms, setForms] = useState([]);
  const [references, setReferences] = useState([]);
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!effectiveUserId) return;
    const [profileResult, formsResult, accessResult, referencesResult] = await Promise.all([
      supabase.from("profiles").select("full_name, phone, email, work_region, union_association, ccq_number, ccq_expiration_date, birth_date, ccq_card_path, show_on_boards").eq("id", effectiveUserId).single(),
      supabase.from("employee_forms").select("form_id, name_fr, name_en, url, employee_specific, sort_order").eq("enabled", true).order("sort_order").limit(QUERY_BUDGETS.managedForms),
      supabase.from("employee_form_access").select("form_id").eq("employee_id", user.id),
      supabase.from("profile_references").select("id, section, title, description, blocks").eq("published", true).order("sort_order").order("created_at").limit(QUERY_BUDGETS.profileReferences),
    ]);
    const loadError = profileResult.error || formsResult.error || accessResult.error || referencesResult.error;
    if (loadError) setError(loadError.message);
    else {
      setProfile(profileResult.data);
      const accessibleIds = new Set((accessResult.data || []).map((row) => row.form_id));
      setForms((formsResult.data || []).filter((form) => form.url && (!form.employee_specific || accessibleIds.has(form.form_id))));
      setReferences(referencesResult.data || []);
    }
    setLoading(false);
  }, [effectiveUserId, user?.id]);

  const formName = (form) => (language === "en" ? form.name_en || form.name_fr : form.name_fr || form.name_en) || "—";
  const quickReferences = references.filter((reference) => reference.section === "quick");
  const contactReferences = references.filter((reference) => reference.section === "contacts");

  useEffect(() => { load(); }, [load]);

  async function toggleShowOnBoards(next) {
    setProfile((current) => ({ ...current, show_on_boards: next }));
    const { error: updateError } = await supabase.from("profiles").update({ show_on_boards: next }).eq("id", effectiveUserId);
    if (updateError) {
      setError(updateError.message);
      setProfile((current) => ({ ...current, show_on_boards: !next }));
    }
  }

  const showBoardsToggle = !isViewMode && isOwnerRole(role);

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t("profile.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("profile.description")}</p>
        </div>
        {loading && <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">{t("common.loading")}</div>}
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300">{error}</div>}
        {!loading && !error && (
          <>
            <CollapsibleCard icon={UserRound} title={t("profile.information")}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Info label={t("auth.fullName")} value={profile?.full_name} icon={UserRound} />
                <Info label={t("auth.phone")} value={profile?.phone} icon={Phone} href={profile?.phone ? `tel:${profile.phone}` : undefined} />
                <Info label={t("auth.email")} value={profile?.email || (!isViewMode ? user?.email : "")} icon={Mail} href={profile?.email ? `mailto:${profile.email}` : undefined} />
                <Info label={t("profile.region")} value={QUEBEC_REGIONS.find((region) => region.code === profile?.work_region)?.name} icon={MapPin} />
                <Info label={t("profile.unionAssociation")} value={UNION_ASSOCIATIONS.find((association) => association.code === profile?.union_association)?.employeeLabel} icon={Users} />
                <Info label={t("profile.sector")} value={t("employees.commercialSector")} icon={Building2} />
              </div>
              {showBoardsToggle && (
                <div className="mt-4 border-t pt-4">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border p-3">
                    <span className="flex items-center gap-2 text-sm font-medium"><Radio className="h-4 w-4 text-primary" />{t("profile.showOnBoards")}</span>
                    <input type="checkbox" className="h-4 w-4" checked={profile?.show_on_boards !== false} onChange={(event) => toggleShowOnBoards(event.target.checked)} />
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">{t("profile.showOnBoardsHint")}</p>
                </div>
              )}
              {!isViewMode && <PushNotificationsToggle />}
              {!isViewMode && (
                <div className="mt-4 border-t pt-4">
                  <CcqCardCapture userId={effectiveUserId} profile={profile} onSaved={load} />
                </div>
              )}
            </CollapsibleCard>

            <QuickReferenceCard references={quickReferences} />

            {contactReferences.length > 0 && (
              <CollapsibleCard icon={Phone} title={t("profile.contacts")} description={t("profile.contactsDescription")}>
                <ContactsReference references={contactReferences} />
              </CollapsibleCard>
            )}

            <CollapsibleCard icon={ClipboardList} title={t("profile.forms")} description={t("profile.formsDescription")}>
              <div className="grid gap-3 sm:grid-cols-2">
                {forms.map((form) => <a key={form.form_id} href={form.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg border p-4 font-medium hover:border-primary/50 hover:bg-accent">{formName(form)}<ExternalLink className="h-4 w-4 text-muted-foreground" /></a>)}
                {forms.length === 0 && <p className="col-span-full text-sm text-muted-foreground">{t("profile.noForms")}</p>}
              </div>
            </CollapsibleCard>

          </>
        )}
      </div>
    </AppShell>
  );
}

function ReferenceButton({ reference }) {
  const href = directLink(reference);
  const className = "flex w-full items-center justify-between rounded-lg border p-4 text-left font-medium transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        <span>{reference.title}</span>
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
      </a>
    );
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={className}>
          <span>{reference.title}</span>
          <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reference.title}</DialogTitle>
          {reference.description && <DialogDescription>{reference.description}</DialogDescription>}
        </DialogHeader>
        <ReferenceContent blocks={reference.blocks} />
      </DialogContent>
    </Dialog>
  );
}

function QuickReferenceCard({ references }) {
  const t = useT();
  return (
    <CollapsibleCard icon={BookOpen} title={t("profile.quickReference")} description={t("profile.quickReferenceDescription")}>
      <div className="space-y-3">
        {references.map((reference) => <ReferenceButton key={reference.id} reference={reference} />)}
        {references.length === 0 && <p className="text-sm text-muted-foreground">{t("profile.noReferences")}</p>}
      </div>
    </CollapsibleCard>
  );
}

// Shown inline inside its collapsible card: one titled section per contact reference.
function ContactsReference({ references }) {
  return (
    <div className="space-y-5 text-sm leading-relaxed">
      {references.map((reference) => (
        <ReferenceSection key={reference.id} title={reference.title}>
          <ReferenceContent blocks={reference.blocks} />
        </ReferenceSection>
      ))}
    </div>
  );
}

function CollapsibleCard({ icon: Icon, title, description, defaultOpen = false, children }) {
  return (
    <Card>
      <details className="group" open={defaultOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 select-none [&::-webkit-details-marker]:hidden">
          <span className="flex flex-col">
            <span className="flex items-center gap-2 font-semibold">{Icon && <Icon className="h-5 w-5 text-primary" />}{title}</span>
            {description && <span className="mt-1 text-sm text-muted-foreground">{description}</span>}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t p-4">{children}</div>
      </details>
    </Card>
  );
}

function ReferenceSection({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold text-primary">{title}</h3>
      {children}
    </section>
  );
}

function Info({ label, value, icon: Icon, href }) {
  const content = <span className="break-words font-medium">{value || "—"}</span>;
  return <div className="rounded-lg bg-muted/50 p-4"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>{href && value ? <a href={href} className="text-primary hover:underline">{content}</a> : content}</div>;
}
