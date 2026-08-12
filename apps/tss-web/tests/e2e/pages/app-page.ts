import type { Locator, Page } from "@playwright/test";

export class AppPage {
	protected readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	get body(): Locator {
		return this.page.locator("body");
	}

	async goto(path = "/") {
		await this.page.goto(path);
	}
}
