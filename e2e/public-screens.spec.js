import { expect, test } from "@playwright/test";

// Public screens: no account, no backend. They prove the shipped bundle boots, French is the first
// language, English is one click away (and loaded on demand), and a signed-out visitor cannot reach a page.

test.describe("signed out", () => {
  test("opens in French on the login screen without a console error", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.getByText("Connectez-vous à votre compte")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a signed-out visitor to a manager page lands on the login screen", async ({ page }) => {
    await page.goto("/#/manager");
    await expect(page.getByText("Connectez-vous à votre compte")).toBeVisible();
    await expect(page.getByLabel("Courriel")).toBeVisible();
  });

  test("English loads on demand, then is remembered after a reload", async ({ page }) => {
    const requested = [];
    page.on("request", (request) => requested.push(request.url()));
    await page.goto("/");
    await expect(page.getByText("Connectez-vous à votre compte")).toBeVisible();
    expect(requested.some((url) => /i18n-en/.test(url))).toBe(false); // French first: no English chunk yet

    await page.getByRole("button", { name: "Changer de langue" }).click();
    await expect(page.getByText("Log in to your account")).toBeVisible();
    expect(requested.some((url) => /i18n-en/.test(url))).toBe(true);

    await page.reload();
    await expect(page.getByText("Log in to your account")).toBeVisible();
  });

  test("a wrong password shows a message and keeps the page usable", async ({ page }) => {
    await page.route("**/auth/v1/token**", (route) => route.fulfill({
      status: 400, contentType: "application/json",
      body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }),
    }));
    await page.goto("/");
    await page.getByLabel("Courriel").fill("personne@example.com");
    await page.locator("#password").fill("mauvais-mot-de-passe");
    await page.locator("form button[type=submit]").first().click();
    await expect(page.getByText("Courriel ou mot de passe incorrect.")).toBeVisible();
    await expect(page.getByLabel("Courriel")).toBeEnabled();
  });
});

// Signed-in checks run only with a dedicated test account (see playwright.config.js).
const hasAccount = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);
test.describe("signed in (test account)", () => {
  test.skip(!hasAccount, "set E2E_EMAIL and E2E_PASSWORD to run");

  test("logs in and leaves the login screen", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Courriel").fill(process.env.E2E_EMAIL);
    await page.locator("#password").fill(process.env.E2E_PASSWORD);
    await page.locator("form button[type=submit]").first().click();
    await expect(page.getByText("Connectez-vous à votre compte")).toBeHidden({ timeout: 15_000 });
  });
});
