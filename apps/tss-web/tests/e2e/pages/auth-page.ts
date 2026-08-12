import type { Locator, Page } from "@playwright/test";
import { AppPage } from "./app-page";

export class AuthPage extends AppPage {
	readonly emailInput: Locator;
	readonly passwordInput: Locator;
	readonly signInButton: Locator;
	readonly signUpToggle: Locator;
	readonly signupButton: Locator;
	constructor(page: Page) {
		super(page);
		this.signupButton = page.getByText("Sign up");
		this.emailInput = page.locator("#Email");
		this.passwordInput = page.locator("#Password");
		this.signInButton = page.getByRole("button", { name: "Sign in" });
	}

	async goto() {
		await super.goto("/auth");
	}
}
