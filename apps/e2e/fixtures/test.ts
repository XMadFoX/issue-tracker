import { test as base } from "@playwright/test";
import { createAuthPage } from "../pages/auth.page";
import { closeDb, deleteUserByEmail, getUser } from "./db";

export interface TestUser {
	name: string;
	email: string;
	password: string;
}

export type AuthPage = ReturnType<typeof createAuthPage>;

interface CustomFixtures {
	authPage: AuthPage;
	testUser: TestUser;
}

interface CustomWorkerFixtures {
	dbTeardown: void;
}

export const test = base.extend<CustomFixtures, CustomWorkerFixtures>({
	authPage: async ({ page }, use) => {
		await use(createAuthPage(page));
	},

	testUser: async ({}, use) => {
		const uid = Math.random().toString(36).slice(2, 8);
		const user: TestUser = {
			name: `Test User ${uid}`,
			email: `test-${uid}@example.com`,
			password: "Password123!",
		};

		await use(user);

		await deleteUserByEmail(user.email);
	},

	dbTeardown: [
		async ({}, use) => {
			await use();
			await closeDb();
		},
		{ scope: "worker", auto: true },
	],
});

export { expect } from "@playwright/test";
export { closeDb, deleteUserByEmail, getUser };
