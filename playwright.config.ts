import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.RAFIQ_STAGING_URL;
if (!baseURL) throw new Error("Set RAFIQ_STAGING_URL to the HTTPS staging deployment URL.");
if (!/^https:\/\//i.test(baseURL)) throw new Error("Staging E2E requires HTTPS.");
if (process.env.RAFIQ_E2E_ALLOW_SUBMISSIONS !== "1") {
  throw new Error("Set RAFIQ_E2E_ALLOW_SUBMISSIONS=1 only after confirming this is isolated staging.");
}
if (process.env.RAFIQ_E2E_NO_EXTERNAL_MESSAGING !== "1") {
  throw new Error("Disable outbound Telegram/WhatsApp in staging and set RAFIQ_E2E_NO_EXTERNAL_MESSAGING=1.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: false,
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
