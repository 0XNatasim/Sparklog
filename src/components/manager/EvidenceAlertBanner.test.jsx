// @vitest-environment jsdom
// Alert « justificatifs pas encore téléchargés » (0129): shown only when something is waiting, with the way to Justificatifs.
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/supabaseClient", () => ({ supabase: { rpc: (...args) => rpc(...args) } }));
const { default: EvidenceAlertBanner } = await import("./EvidenceAlertBanner");

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("EvidenceAlertBanner", () => {
  it("warns with the counts and links to Justificatifs", async () => {
    rpc.mockResolvedValue({ data: [{ total: 7, overtime: 4, parking: 3, oldest_days: 25, days_left: 5 }], error: null });
    render(<MemoryRouter><EvidenceAlertBanner link /></MemoryRouter>);
    expect(await screen.findByText(/7 justificatif\(s\) pas encore téléchargé\(s\) ont 21 jours ou plus/)).toBeTruthy();
    expect(screen.getByText(/4 temps supp · 3 stationnement.*5 jour/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Aller aux justificatifs" }).getAttribute("href")).toBe("/manager/todo?tab=receipts");
    expect(rpc).toHaveBeenCalledWith("evidence_download_alert", { p_days: 21 });
  });

  it("shows nothing when everything is downloaded, or when the read fails", async () => {
    rpc.mockResolvedValue({ data: [{ total: 0, overtime: 0, parking: 0, oldest_days: 0, days_left: null }], error: null });
    const { container } = render(<MemoryRouter><EvidenceAlertBanner /></MemoryRouter>);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    cleanup();
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    const failed = render(<MemoryRouter><EvidenceAlertBanner /></MemoryRouter>);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(failed.container.textContent).toBe("");
  });
});
