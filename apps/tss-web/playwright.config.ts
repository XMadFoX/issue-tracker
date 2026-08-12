import { defineConfig, devices } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const isCi = process.env.CI === "true";

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: true,
	forbidOnly: isCi,
	retries: isCi ? 2 : 0,
	workers: isCi ? 1 : undefined,
	reporter: [
		["html"],
		["list"],
		["allure-playwright", { resultsDir: "allure-results" }],
	],
	use: {
		baseURL: baseUrl,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	webServer: {
		command: "bun run dev",
		url: baseUrl,
		reuseExistingServer: !isCi,
		timeout: 120_000,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
		},
		{
			name: "mobile-chrome",
			use: { ...devices["Pixel 7"] },
		},
	],
});
