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
  it("is short: « Prenez 2 captures du formulaire AVANT… » (the word opens the form in another window), the two examples with what each shows", async () => {
    render(wrap(<OvertimeEvidenceStep {...props} explain={{ ot: "261821", hours: 8, perJob: true }} />));
    expect(screen.getByText("Preuve de temps supplémentaire requise")).toBeTruthy();
    // « Temps supplémentaire pour quel OT ? » comes first, alone: no photo instructions yet.
    expect(screen.getByText("Temps supplémentaire pour quel OT ?")).toBeTruthy();
    expect(screen.queryByText("On doit voir les 2 photos comme celles-ci :")).toBeNull();
    fireEvent.change(screen.getByLabelText("Temps supplémentaire pour quel OT ?"), { target: { value: "261821" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    // The form is the one listed in Profil › Formulaires: its own address (not coded here), opened in a new window.
    const link = await screen.findByRole("link", { name: "formulaire" });
    expect(link.getAttribute("href")).toBe("https://forms.example/confirm");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.parentElement.textContent).toBe("Prenez 2 captures du formulaire AVANT de faire « Envoyer ».");
    expect(screen.getByText(/Pour l’OT 261821/)).toBeTruthy();
    expect(screen.getByText("On doit voir les 2 photos comme celles-ci :").className).toContain("text-destructive");
    expect(screen.getByText("Photo 1 :")).toBeTruthy();
    // the form has no OT question any more: photo 1 shows question 2 only
    expect(screen.queryByText("Question 1 : le numéro d’OT")).toBeNull();
    expect(screen.getByText("Question 2 : le temps chez le client")).toBeTruthy();
    expect(screen.getByText("Photo 2 :")).toBeTruthy();
    expect(screen.getByText("Question 3 : le temps de retour, si applicable")).toBeTruthy();
    expect(screen.getByAltText(/Exemple de capture 1/).getAttribute("src")).toBe("/overtime-example-1.webp");
    expect(screen.getByAltText(/Exemple de capture 2/).getAttribute("src")).toBe("/overtime-example-2.webp");
    expect(screen.queryByText(/chaque OT qui dépasse/)).toBeNull();
  });
});

describe("pickOvertimeConfirmationForm", () => {
  const form = (extra) => ({ form_id: "x", name_fr: "Autre", name_en: null, url: "https://f/x", enabled: true, ...extra });
  it("prefers its row id, then its name, and ignores disabled or address-less rows", () => {
    expect(pickOvertimeConfirmationForm([form({ form_id: "3786f813-675c-4f6a-87ad-ebf8f7654e7c" })]).url).toBe("https://f/x");
    expect(pickOvertimeConfirmationForm([form({ name_fr: "confirmation de temps SUPP." })])).not.toBeNull();
    expect(pickOvertimeConfirmationForm([form({ name_fr: "Confirmation de Temps supp.", enabled: false })])).toBeNull();
    expect(pickOvertimeConfirmationForm([form({ name_fr: "Confirmation de Temps supp.", url: "" })])).toBeNull();
    expect(pickOvertimeConfirmationForm([form({ name_fr: "Confirmation de surtemps" })])).not.toBeNull(); // the name in Profil › Formulaires today
    expect(pickOvertimeConfirmationForm([form()])).toBeNull();
  });
});

describe("OvertimeEvidenceStep: the OT question", () => {
  it("only continues with 3 to 8 digits, warns (without blocking) when the OT is not the sheet's, and lets the OT be changed", () => {
    render(wrap(<OvertimeEvidenceStep {...props} explain={{ ot: "261821", hours: 8, perJob: true }} />));
    const box = screen.getByLabelText("Temps supplémentaire pour quel OT ?");
    const go = screen.getByRole("button", { name: "Continuer" });
    expect(go.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "12" } });
    expect(go.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("3 à 8 chiffres");
    fireEvent.change(box, { target: { value: "270825" } });
    expect(go.disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("cette fiche est pour l’OT 261821");
    fireEvent.click(go);
    expect(screen.getByText(/Pour l’OT 270825/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Changer" }));
    expect(screen.getByLabelText("Temps supplémentaire pour quel OT ?")).toBeTruthy();
  });
});

describe("OvertimeEvidenceStep: two captures", () => {
  const png = (name) => new File(["x"], name, { type: "image/png" });
  it("only sends once BOTH captures are chosen, and hands them over in order (real duration, then return)", () => {
    const onFiles = vi.fn();
    render(wrap(<OvertimeEvidenceStep {...props} onFiles={onFiles} />));
    fireEvent.change(screen.getByLabelText("Temps supplémentaire pour quel OT ?"), { target: { value: "OT-270825" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    const send = screen.getByRole("button", { name: "Envoyer les 2 captures" });
    expect(send.disabled).toBe(true);
    const first = png("q2.png");
    const second = png("q3.png");
    fireEvent.change(screen.getByLabelText("Capture 1 — Durée réelle chez le client"), { target: { files: [first] } });
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Capture 2 — Durée du retour"), { target: { files: [second] } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    // the OT typed before the proof page goes with the captures, cleaned (« OT-270825 » → 270825)
    expect(onFiles).toHaveBeenCalledWith(first, second, "270825");
  });
});
