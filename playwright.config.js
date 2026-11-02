import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (V2.4.227). They drive the BUILT app (`vite build` + `vite preview`) in a real Chromium.
// Without credentials only the public screens are tested; set E2E_EMAIL / E2E_PASSWORD (a dedicated TEST
// account, never a real employee) and the signed-in checks run too. Nothing here saves or approves data.
//
//   npm run e2e                      # builds, serves on :4173, runs
//   E2E_CHROMIUM=/path/to/chrome npm run e2e   # use an installed Chromium (e.g. cloud sandboxes)
const port = Number(process.env.E2E_PORT || 4173);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM, args: ["--no-sandbox"] } : { args: ["--no-sandbox"] },
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], launchOptions: undefined, ...(process.env.E2E_CHROMIUM ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM, args: ["--no-sandbox"] } } : {}) } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // Placeholder Supabase values: the public screens never need a reachable backend.
    command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || "e2e-placeholder-anon-key",
    },
  },
});
