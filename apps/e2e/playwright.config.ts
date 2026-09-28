import { defineConfig, devices } from "@playwright/test";
import { env } from "./env";

const baseURL = env.APP_URL;

export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: env.CI,
	retries: env.CI ? 2 : 0,
	workers: env.CI ? 1 : undefined,
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "firefox",
			use: { ...devices["Desktop Firefox"] },
		},
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
		},
	],
	webServer: {
		command: "bun dev",
		url: baseURL,
		reuseExistingServer: !env.CI,
		cwd: "../../",
		timeout: 120 * 1000,
	},
});
