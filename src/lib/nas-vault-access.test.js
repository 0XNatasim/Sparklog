import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// S-2: the browser never reads or writes the NAS vault table directly. Every access goes
// through an audited RPC (reveal_nas, set_nas, nas_presence, export_ccq_nas — migration 0084).
const srcDir = fileURLToPath(new URL("..", import.meta.url));
function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("NAS vault access", () => {
  it("has no direct employee_sensitive table query in the app", () => {
    const offenders = sourceFiles(srcDir).filter((path) => /from\(\s*["']employee_sensitive["']\s*\)/.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
