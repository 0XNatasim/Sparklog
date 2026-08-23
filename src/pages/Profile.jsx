import React, { useEffect, useState } from "react";
import { BookOpen, ExternalLink, Mail, Phone, UserRound } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300">{error}</div>}
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
              <CardContent className="space-y-3">
                <ReservationStatusReference />
                <CalypsoV1Reference />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function ReservationStatusReference() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between rounded-lg border p-4 text-left font-medium transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <span>Status de réservation</span>
          <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Status de réservation</DialogTitle>
          <DialogDescription>
            Rappel de la bonne utilisation des statuts lors de la fermeture des OT.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 text-sm leading-relaxed">
          <p>Il existe plusieurs statuts de réservation lors de la fermeture des OT. Ce message est un rappel de la bonne utilisation de chacun d&apos;entre eux.</p>

          <ReferenceSection title="Annulé – Refus d'installer">
            <p>À utiliser lorsque le client ne souhaite plus la solution Hilo, change d&apos;idée ou refuse définitivement l&apos;installation.</p>
          </ReferenceSection>

          <ReferenceSection title="Annulé – Client absent">
            <p>Appelez le client au numéro inscrit au dossier en composant <strong>#31#</strong> avant le numéro.</p>
            <p className="font-semibold">Si le client répond :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Peut-il être présent dans les 15 prochaines minutes?</li>
              <li><strong>Oui :</strong> attendez sur place et procédez à l&apos;installation.</li>
              <li><strong>Non :</strong> mettez le statut « Annulé – Client absent » et informez la répartition.</li>
            </ul>
            <p className="font-semibold">Si le client ne répond pas :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Communiquez avec la répartition afin qu&apos;elle tente également de joindre le client.</li>
              <li>Après 15 minutes, mettez le statut « Annulé – Client absent » et informez la répartition.</li>
              <li>Ajoutez une photo de la porte du client dans la section « Notes rapides » de l&apos;OT.</li>
              <li>Inscrivez toute information pertinente pouvant expliquer la situation.</li>
            </ul>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <strong>Important :</strong> Si le client n&apos;est pas prêt pour l&apos;installation, mais souhaite qu&apos;elle soit effectuée à une date ultérieure, utilisez également le statut « Annulé – Client absent » et expliquez clairement la situation dans les notes.
            </div>
          </ReferenceSection>

          <ReferenceSection title="En attente de thermostats">
            <p className="font-semibold text-destructive dark:text-red-300">Ce statut ne doit jamais être utilisé.</p>
          </ReferenceSection>

          <ReferenceSection title="Non admissible">
            <p>Utilisez ce statut uniquement dans les situations suivantes :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Absence de réseau Internet.</li>
              <li>Le client ne possède pas de téléphone intelligent ou de tablette compatible.</li>
              <li>Installation impossible pour une raison technique ou autre.</li>
            </ul>
            <p>Dans tous les cas de non-admissibilité, veuillez inscrire dans les notes la raison précise pour laquelle l&apos;installation n&apos;a pas pu être réalisée. Ces informations nous permettent de bien comprendre la situation, de l&apos;expliquer au client au besoin et d&apos;éviter des communications inutiles.</p>
          </ReferenceSection>

          <p className="border-t pt-4 font-medium">Merci à tous de votre collaboration et de votre vigilance dans l&apos;utilisation des statuts.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CalypsoV1Reference() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between rounded-lg border p-4 text-left font-medium transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <span>Calypso V1</span>
          <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Calypso V1</DialogTitle>
          <DialogDescription>Information importante concernant les appareils Calypso V1.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm leading-relaxed">
          <p className="font-semibold text-destructive dark:text-red-300">
            Svp ne plus installer de Calypso V1.
          </p>
          <p>
            S&apos;il vous en reste en votre possession, veuillez les rapporter à votre entrepôt.
          </p>
          <p>
            Nous sommes présentement en train de faire des tests sur les V1.
          </p>
        </div>
      </DialogContent>
    </Dialog>
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
