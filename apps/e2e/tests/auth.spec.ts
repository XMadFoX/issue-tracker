import { expect, test } from "../fixtures/test";

test.describe("Authentication - UI-AUTH Test Cases", () => {
	/**
	 * Test Case: UI-AUTH-01
	 * Description: Auth Form Render
	 * Target Route: /auth
	 * Expected Result: Displays email input, password input, sign-in button,
	 * and sign-up toggle link.
	 */
	test("[UI-AUTH-01] Auth Form Render", async ({ authPage }) => {
		await test.step("Navigate to /auth route", async () => {
			await authPage.goto();
		});

		await test.step("Verify default sign-in fields and buttons are visible", async () => {
			await expect(authPage.emailInput).toBeVisible();
			await expect(authPage.passwordInput).toBeVisible();
			await expect(authPage.signInSubmitButton).toBeVisible();
			await expect(authPage.toggleSignUpButton).toBeVisible();
		});

		await test.step("Verify sign-up-only fields are hidden in sign-in mode", async () => {
			await expect(authPage.nameInput).not.toBeVisible();
			await expect(authPage.signUpSubmitButton).not.toBeVisible();
		});
	});

	/**
	 * Test Case: UI-AUTH-02
	 * Description: Toggle Sign-In / Sign-Up Mode
	 * Target Route: /auth
	 * Expected Result: Toggles submit button text between 'Sign In' and 'Sign Up'.
	 * Shows name input when in sign-up mode. Hides name input when returning to sign-in.
	 */
	test("[UI-AUTH-02] Toggle Sign-In / Sign-Up Mode", async ({ authPage }) => {
		await test.step("Navigate to /auth route", async () => {
			await authPage.goto();
		});

		await test.step("Click sign-up toggle link and verify sign-up mode", async () => {
			await authPage.switchToSignUp();

			await expect(authPage.nameInput).toBeVisible();
			await expect(authPage.signUpSubmitButton).toBeVisible();
			await expect(authPage.toggleSignInButton).toBeVisible();
			await expect(authPage.signInSubmitButton).not.toBeVisible();
		});

		await test.step("Click sign-in toggle link and verify return to sign-in mode", async () => {
			await authPage.switchToSignIn();

			await expect(authPage.nameInput).not.toBeVisible();
			await expect(authPage.signInSubmitButton).toBeVisible();
			await expect(authPage.toggleSignUpButton).toBeVisible();
			await expect(authPage.signUpSubmitButton).not.toBeVisible();
		});
	});
});
