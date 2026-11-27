import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import {
  MAX_NOTE_FILES, addPickedNoteImages, listNotePictures, noteDays, noteFilePath, noteSummaryText, noteWeeks, noteZipNames, selectNotePictures,
} from "./note-files";

const pic = (name, type = "image/jpeg", size = 1000) => ({ name, type, size });

describe("pictures picked for a note", () => {
  it("keeps pictures and screenshots, refuses what is not an image, empty, too large or an SVG", () => {
    const { files, skipped } = addPickedNoteImages([], [pic("a.jpg"), pic("b.png", "image/png"), pic("c.pdf", "application/pdf"), pic("d.svg", "image/svg+xml"), pic("e.jpg", "image/jpeg", 0), pic("f.jpg", "image/jpeg", 31 * 1024 * 1024)]);
    expect(files.map((file) => file.name)).toEqual(["a.jpg", "b.png"]);
    expect(skipped).toBe(4);
  });

  it("stops at 10 pictures per note, counting those the note already has", () => {
    const many = Array.from({ length: 12 }, (_, i) => pic(`p${i}.jpg`));
    expect(addPickedNoteImages([], many).files).toHaveLength(MAX_NOTE_FILES);
    expect(addPickedNoteImages([], many, 8)).toMatchObject({ skipped: 10 });
    expect(addPickedNoteImages([], many, 8).files).toHaveLength(2);
  });

  it("puts the object in the sender's own folder", () => {
    expect(noteFilePath("user-1", "abc")).toBe("user-1/abc.jpg");
  });
});

describe("download of the pictures by day or week", () => {
  const notes = [
    { id: "n1", date: "2026-11-24", author: "Éric", ot: "270825", text: "Casque oublié" },
    { id: "n2", date: "2026-11-24", author: "Luc", ot: "", text: "RAS" },
    { id: "n3", date: "2026-11-30", author: "Éric", ot: "CONTREMAÎTRE", text: "Autre semaine" },
    { id: "n4", date: "2026-11-25", author: "Éric", ot: "", text: "Sans photo" },
  ];
  const byNote = new Map([
    ["n1", [{ path: "u/1.jpg" }, { path: "u/2.jpg" }]],
    ["n2", [{ path: "u/3.jpg" }]],
    ["n3", [{ path: "u/4.jpg" }]],
  ]);
  const files = listNotePictures(notes, byNote);

  it("lists every picture, dated, in day then author order", () => {
    expect(files.map((file) => file.path)).toEqual(["u/1.jpg", "u/2.jpg", "u/3.jpg", "u/4.jpg"]);
    expect(files[0]).toMatchObject({ date: "2026-11-24", author: "Éric", ot: "270825", index: 1, count: 2 });
  });

  it("offers the days and the Sunday → Saturday weeks that hold a picture, newest first", () => {
    expect(noteDays(files)).toEqual(["2026-11-30", "2026-11-24"]);
    expect(noteWeeks(files).map((week) => [week.start, week.end])).toEqual([["2026-11-29", "2026-12-05"], ["2026-11-22", "2026-11-28"]]);
  });

  it("selects one day or one week", () => {
    expect(selectNotePictures(files, { from: "2026-11-24", to: "2026-11-24" })).toHaveLength(3);
    expect(selectNotePictures(files, { from: "2026-11-22", to: "2026-11-28" })).toHaveLength(3);
    expect(selectNotePictures(files, { from: "2026-11-29", to: "2026-12-05" })).toHaveLength(1);
  });

  it("names the pictures date_author_OT, numbered when a note has several, without forbidden characters", () => {
    expect(noteZipNames(files)).toEqual([
      "2026-11-24_Éric_OT 270825_1.jpg", "2026-11-24_Éric_OT 270825_2.jpg", "2026-11-24_Luc.jpg", "2026-11-30_Éric_OT CONTREMAÎTRE.jpg",
    ]);
    expect(noteZipNames([{ date: "2026-11-24", author: "A/B:C", ot: "", index: 1, count: 1 }, { date: "2026-11-24", author: "A/B:C", ot: "", index: 1, count: 1 }]))
      .toEqual(["2026-11-24_A-B-C.jpg", "2026-11-24_A-B-C (2).jpg"]);
  });

  it("writes a notes.txt with the text of each note that has a picture in the ZIP", () => {
    const week = selectNotePictures(files, { from: "2026-11-22", to: "2026-11-28" });
    const text = noteSummaryText(notes, week, noteZipNames(week));
    expect(text).toContain("2026-11-24 — Éric — OT 270825\nCasque oublié\n  [2026-11-24_Éric_OT 270825_1.jpg]\n  [2026-11-24_Éric_OT 270825_2.jpg]");
    expect(text).toContain("RAS");
    expect(text).not.toContain("Sans photo");
    expect(text).not.toContain("Autre semaine");
  });
});

describe("migration 0165", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261127120000_0165_note_files.sql"), "utf8");

  it("keeps the bucket private, images only", () => {
    expect(sql).toContain("values ('note-files', 'note-files', false");
    expect(sql).toContain("array['image/jpeg', 'image/png', 'image/webp']");
  });

  it("makes a picture follow the note it belongs to (the policies ask the notes' own row-level security)", () => {
    expect(sql).toContain("exists (select 1 from public.manager_notes n where n.id = note_files.manager_note_id)");
    expect(sql).toContain("exists (select 1 from public.foreman_reports r where r.id = note_files.foreman_report_id)");
    expect(sql).toMatch(/n\.user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/note_files_one_parent check/);
  });

  it("fixes the server-owned fields, the sender's folder and the limit of 10 per note", () => {
    expect(sql).toContain("new.uploaded_by := auth.uid()");
    expect(sql).toContain("note_file_path");
    expect(sql).toContain(">= 10");
    expect(sql).toContain("note_files_limit");
  });

  it("gives the browser no update right and reads the bucket through the table", () => {
    expect(sql).toContain("revoke all on public.note_files from anon, public, authenticated");
    expect(sql).toContain("grant select, insert, delete on public.note_files to authenticated");
    expect(sql).toContain("f.path = objects.name");
    expect(sql).not.toMatch(/grant [^;]*update[^;]*note_files/);
  });
});
