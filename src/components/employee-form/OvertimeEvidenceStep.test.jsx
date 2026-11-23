// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  rows: [{ form_id: "other", name_fr: "Demande de temps supp.", name_en: "Overtime Request", url: "https://forms.example/a", enabled: true },
    { form_id: "3786f813-675c-4f6a-87ad-ebf8f7654e7c", name_fr: "Confirmation de Temps supp.", name_en: "Real-time overtime", url: "https://forms.example/confirm", enabled: true }],
}));
vi.mock("@/supabaseClient", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: h.rows, error: null }) }) }) }) },
}));

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { pickOvertimeConfirmationForm } from "@/lib/overtime-form-link";
import OvertimeEvidenceStep from "./OvertimeEvidenceStep";
import { dictionaries } from "@/lib/i18n";

const t = (key, values = {}) => String(dictionaries.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
const wrap = (node) => <Dialog open><DialogContent>{node}</DialogContent></Dialog>;
const props = { t, onFiles: () => {}, busy: false };

afterEach(cleanup);

describe("OvertimeEvidenceStep texts", () => {
  it("states the rule, the OT and the form name, without the old daily-total sentence", async () => {
    render(wrap(<OvertimeEvidenceStep {...props} explain={{ ot: "261821", hours: 8, perJob: true }} />));
    expect(screen.getByText("Preuve de temps supplémentaire requise")).toBeTruthy();
    expect(screen.getByText(/chaque OT qui dépasse 8 h dans la journée a sa propre capture/)).toBeTruthy();
    // The form is the one listed in Profil › Formulaires: its own name, linked to its own address (not coded here).
    const link = await screen.findByRole("link", { name: "Confirmation de Temps supp." });
    expect(link.getAttribute("href")).toBe("https://forms.example/confirm");
    expect(screen.getByText(/Celle-ci est pour l’OT 261821/)).toBeTruthy();
    expect(screen.queryByText(/Votre total quotidien dépasse/)).toBeNull();
  });

  it("shows the « both questions visible » requirement in red", () => {
    render(wrap(<OvertimeEvidenceStep {...props} explain={{ ot: "1", hours: 8, perJob: true }} />));
    expect(screen.getByText(/Les deux captures sont obligatoires/).className).toContain("text-destructive");
  });
});

describe("pickOvertimeConfirmationForm", () => {
  const form = (extra) => ({ form_id: "x", name_fr: "Autre", name_en: null, url: "https://f/x", enabled: true, ...extra });
  it("prefers its row id, then its name, and ignores disabled or address-less rows", () => {
    expect(pickOvertimeConfirmationForm([form({ form_id: "3786f813-675c-4f6a-87ad-ebf8f7654e7c" })]).url).toBe("https://f/x");
    expect(pickOvertimeConfirmationForm([form({ name_fr: "confirmation de temps SUPP." })])).not.toBeNull();
    expect(pickOvertimeConfirmationForm([form({ name_fr: "Confirmation de Temps supp.", enabled: false })])).toBeNull();
    expect(pickOvertimeConfirmationForm([form({ name_fr: "Confirmation de Temps supp.", url: "" })])).toBeNull();
    expect(pickOvertimeConfirmationForm([form()])).toBeNull();
  });
});

describe("OvertimeEvidenceStep: two captures", () => {
  const png = (name) => new File(["x"], name, { type: "image/png" });
  it("only sends once BOTH captures are chosen, and hands them over in order (real duration, then return)", () => {
    const onFiles = vi.fn();
    render(wrap(<OvertimeEvidenceStep {...props} onFiles={onFiles} />));
    const send = screen.getByRole("button", { name: "Envoyer les 2 captures" });
    expect(send.disabled).toBe(true);
    const first = png("q2.png");
    const second = png("q3.png");
    fireEvent.change(screen.getByLabelText("Capture 1 — Durée réelle du temps supplémentaire"), { target: { files: [first] } });
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Capture 2 — Durée du retour"), { target: { files: [second] } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(onFiles).toHaveBeenCalledWith(first, second);
  });
});
