import type { Page } from "@playwright/test";

export interface AuthPageNavigateOptions {
	email?: string;
	initialMode?: "signin" | "signup";
	inviteToken?: string;
}

export function createAuthPage(page: Page) {
	const emailInput = page.getByRole("textbox", { name: /email/i });
	const passwordInput = page.getByLabel(/password/i);
	const nameInput = page.getByRole("textbox", { name: /name/i });
	const signInSubmitButton = page.getByRole("button", {
		name: "Sign In",
		exact: true,
	});
	const signUpSubmitButton = page.getByRole("button", {
		name: "Sign Up",
		exact: true,
	});
	const toggleSignUpButton = page.getByRole("button", {
		name: "Sign up",
		exact: true,
	});
	const toggleSignInButton = page.getByRole("button", {
		name: "Sign in",
		exact: true,
	});
	const formError = page.locator(".form-error");

	async function goto(options?: AuthPageNavigateOptions): Promise<void> {
		const params = new URLSearchParams();
		if (options?.email) params.set("email", options.email);
		if (options?.initialMode) params.set("initialMode", options.initialMode);
		if (options?.inviteToken) params.set("inviteToken", options.inviteToken);

		const queryString = params.toString();
		await page.goto(queryString ? `/auth?${queryString}` : "/auth");
	}

	async function switchToSignUp(): Promise<void> {
		await toggleSignUpButton.click();
	}

	async function switchToSignIn(): Promise<void> {
		await toggleSignInButton.click();
	}

	async function signIn(email: string, password: string): Promise<void> {
		await emailInput.fill(email);
		await passwordInput.fill(password);
		await signInSubmitButton.click();
	}

	async function signUp(
		name: string,
		email: string,
		password: string,
	): Promise<void> {
		await switchToSignUp();
		await nameInput.fill(name);
		await emailInput.fill(email);
		await passwordInput.fill(password);
		await signUpSubmitButton.click();
	}

	return {
		page,
		emailInput,
		passwordInput,
		nameInput,
		signInSubmitButton,
		signUpSubmitButton,
		toggleSignUpButton,
		toggleSignInButton,
		formError,
		goto,
		switchToSignUp,
		switchToSignIn,
		signIn,
		signUp,
	};
}
