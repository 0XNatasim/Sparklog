// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import ProofReturnedNotice from "./ProofReturnedNotice";

afterEach(cleanup);

describe("ProofReturnedNotice", () => {
  it("tells the OT, the day, the reason, how to fix it and shows the two example captures", () => {
    render(<ProofReturnedNotice broadcast={{ meta: { ot: "202618", job_date: "2026-11-25", reason: "incomplete" } }} />);
    expect(screen.getByText(/OT 202618 du 25 /)).toBeTruthy();
    expect(screen.getByText(/il manque l’OT, le temps coché ou le retour/)).toBeTruthy();
    expect(screen.getByText(/touchez l’horloge de cet OT/)).toBeTruthy();
    expect(screen.getByText(/Prenez 2 captures du formulaire AVANT/)).toBeTruthy();
    expect(screen.getByAltText(/Exemple de capture 1/).getAttribute("src")).toBe("/overtime-example-1.webp");
    expect(screen.getByAltText(/Exemple de capture 2/).getAttribute("src")).toBe("/overtime-example-2.webp");
  });

  it("shows no reason line when the sender gave none", () => {
    render(<ProofReturnedNotice broadcast={{ meta: { ot: "1", job_date: "2026-11-25", reason: null } }} />);
    expect(screen.queryByText(/^Raison/)).toBeNull();
  });
});

describe("migration 0162 (proof sent back notice)", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261126120000_0162_proof_returned_notice.sql"), "utf8");
  it("adds the kind, writes the message to the job's employee only, and is wired to both ways of sending a proof back", () => {
    expect(sql).toMatch(/add column if not exists kind text/);
    expect(sql).toMatch(/kind is null or kind = 'proof_returned'/);
    expect(sql).toMatch(/insert into public\.broadcast_recipients \(broadcast_id, employee_id\) values \(new_broadcast, job\.user_id\)/);
    expect(sql).toMatch(/revoke all on function public\.notify_proof_returned\(uuid, uuid, text\) from public, anon, authenticated/); // internal
    expect(sql).toMatch(/get_my_role\(\) <> 'manager'/);
    expect(sql).toMatch(/current_job\.status <> 'submitted' or not current_job\.locked/); // same stale-state check as return_job_for_correction
    expect(sql).toMatch(/perform public\.notify_proof_returned\(null, current_job\.id, 'wrongDoc'\)/); // automatic return
    expect(sql).toMatch(/grant execute on function public\.auto_return_wrong_proof\(uuid\) to service_role/);
  });
  it("only keeps a known reason code", () => {
    expect(sql).toMatch(/p_reason in \('incomplete', 'unread', 'mismatch', 'wrongDoc', 'field', 'sms', 'oldForm'\)/);
  });
});
