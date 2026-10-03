import { expect, test } from "../fixtures/test";

test.describe("Authentication - UI-AUTH Test Cases", () => {
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

	test("[UI-AUTH-03] Auth input Validation", async ({ authPage }) => {
		//invalid e-mail
		await test.step("Authenticate with invalid e-mail", async () => {
			await authPage.goto({ initialMode: "signin" });
			await authPage.signIn("invalidEmail", "shortPassword");
			await expect(authPage.emailInput).toHaveJSProperty(
				"validity.valid",
				false,
			);
		});

		//invalid password
		await test.step("Authenticate with invalid password", async () => {
			await authPage.goto({ initialMode: "signin" });
			await authPage.signIn("test@test.qa", "123");
			await expect(authPage.passwordError).toContainText(/too small/i);
		});
	});

	test("[UI-AUTH-04] Submit Unauthenticated login credentials", async ({
		authPage,
	}) => {
		await test.step("Submit Incorrect Credentials and assert a visible error", async () => {
			await authPage.goto({ initialMode: "signin" });
			await authPage.signIn("test@test.qa", "wrongPassword");
			await expect(authPage.formError).toContainText(
				/Invalid email or password/i,
			);
		});
	});

	test("[UI-AUTH-05] Happy Path Authentication", async ({
		authPage,
		testUser,
	}) => {
		const email = testUser.email;
		const password = testUser.password;

		await test.step("Sign up with valid credentials and assert redirection", async () => {
			await authPage.goto({ initialMode: "signup" });
			await authPage.signUp(testUser.name, email, password);
			await expect(authPage.createWorkspaceButton).toBeVisible();
		});

		await test.step("Sign out, submit registered credentials and assert log-in", async () => {
			await authPage.page.context().clearCookies();
			await authPage.goto({ initialMode: "signin" });
			await authPage.signIn(email, password);
			await expect(authPage.createWorkspaceButton).toBeVisible();
		});
	});

	test("[UI-AUTH-06] Invite Token Query Handling", async ({
		authPage,
		testUser,
	}) => {
		const inviteToken = "abc-123";

		await test.step("Navigate to auth with invite token injected", async () => {
			await authPage.goto({ inviteToken });
			await expect(authPage.page).toHaveURL(
				new RegExp(`inviteToken=${inviteToken}`),
			);
		});
		await test.step("Verify token persists after switching to sign-up mode", async () => {
			await authPage.switchToSignUp();
			await expect(authPage.nameInput).toBeVisible();
			await expect(authPage.page).toHaveURL(
				new RegExp(`inviteToken=${inviteToken}`),
			);
		});
		await test.step("Verify token persists after authenticating", async () => {
			await authPage.signUp(testUser.name, testUser.email, testUser.password);
			await expect(authPage.page).toHaveURL(
				new RegExp(`/invite/${inviteToken}$`),
			);
		});
	});
});
