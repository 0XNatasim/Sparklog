import { describe, expect, it, vi } from "vitest";

vi.mock("../supabaseClient", () => ({ supabase: { rpc: vi.fn() } }));

const { describeDevice } = await import("./activity-log");

describe("describeDevice", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "iPhone"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36", "Android"],
    ["Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126 Safari/537.36", "Tablette Android"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36", "Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15", "Mac"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1", "iPad"],
    ["", "Autre"],
  ])("labels %s", (ua, label) => {
    expect(describeDevice(ua)).toBe(label);
  });

  it("marks the installed app", () => {
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", true)).toBe("iPhone · app");
  });
});
