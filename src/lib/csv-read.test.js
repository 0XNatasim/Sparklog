import { describe, expect, it } from "vitest";
import { decodeCsvBytes, parseCsv } from "./csv-read";

describe("csv-read", () => {
  it("reads quotes, doubled quotes, separators and line breaks inside a field, and any line ending", () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\n"x\ny",,\n', ",")).toEqual([["a", "b,c", 'd "e"'], ["1", "2", "3"], ["x\ny", "", ""]]);
    expect(parseCsv("a;b\r1;2", ";")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2", "\t")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("", ",")).toEqual([]);
  });
  it("drops a byte-order mark and reads UTF-8, falling back to Windows-1252 for accents", () => {
    expect(decodeCsvBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x4f, 0x54]))).toBe("OT");
    expect(decodeCsvBytes(new TextEncoder().encode("Électricien"))).toBe("Électricien");
    expect(decodeCsvBytes(new Uint8Array([0xc9, 0x6c, 0x65, 0x63]))).toBe("Élec"); // « Élec » written by Excel in Windows-1252 (not valid UTF-8)
  });
});
