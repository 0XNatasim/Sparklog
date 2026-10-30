import { describe, expect, it } from "vitest";
import { buildZip, crc32 } from "./zip-store";

const bytes = (text) => new TextEncoder().encode(text);

describe("zip-store", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes a readable archive: signatures, entry count, names and stored data", () => {
    const zip = buildZip([{ name: "a/é.txt", data: bytes("hello") }, { name: "b.txt", data: bytes("world!") }], new Date(2026, 9, 31, 12, 0, 0));
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const endAt = zip.length - 22;
    expect(view.getUint32(endAt, true)).toBe(0x06054b50);
    expect(view.getUint16(endAt + 10, true)).toBe(2);
    const centralAt = view.getUint32(endAt + 16, true);
    expect(view.getUint32(centralAt, true)).toBe(0x02014b50);
    expect(view.getUint32(centralAt + 16, true)).toBe(crc32(bytes("hello")));
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("a/é.txt");
    expect(text).toContain("hello");
    expect(text).toContain("world!");
  });
});
