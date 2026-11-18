// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import { Dialog, DialogContent } from "@/components/ui/dialog";
import OvertimeEvidenceStep from "./OvertimeEvidenceStep";
import { dictionaries } from "@/lib/i18n";

const t = (key, values = {}) => String(dictionaries.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
const wrap = (node) => <Dialog open><DialogContent>{node}</DialogContent></Dialog>;
const props = { t, inputRef: { current: null }, onFile: () => {}, busy: false };

afterEach(cleanup);

describe("OvertimeEvidenceStep texts", () => {
  it("states the rule, the OT and the form name, without the old daily-total sentence", () => {
    render(wrap(<OvertimeEvidenceStep {...props} explain={{ ot: "261821", hours: 8, perJob: true }} />));
    expect(screen.getByText("Preuve de temps supplémentaire requise")).toBeTruthy();
    expect(screen.getByText(/chaque OT qui dépasse 8 h dans la journée a sa propre capture/)).toBeTruthy();
    expect(screen.getByText("Confirmation de temps supplémentaire")).toBeTruthy();
    expect(screen.getByText(/Celle-ci est pour l’OT 261821/)).toBeTruthy();
    expect(screen.queryByText(/Votre total quotidien dépasse/)).toBeNull();
  });

  it("shows the « whole form » requirement in red", () => {
    render(wrap(<OvertimeEvidenceStep {...props} explain={{ ot: "1", hours: 8, perJob: true }} />));
    expect(screen.getByText(/Tout le formulaire sur la capture/).className).toContain("text-destructive");
  });
});
