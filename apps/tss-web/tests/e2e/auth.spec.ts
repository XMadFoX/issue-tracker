import { expect, test } from "@playwright/test";
import { AuthPage } from "./pages/auth-page";

test("auth page renders the sign in form", async ({ page }) => {
	const authPage = new AuthPage(page);

	await authPage.goto();

	await expect(authPage.emailInput).toBeVisible();
	await expect(authPage.passwordInput).toBeVisible();
	await expect(authPage.signInButton).toBeVisible();
	await expect(authPage.signUpToggle).toBeVisible();
});
