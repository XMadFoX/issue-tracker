import { closeDb, db } from "db";
import { user } from "db/features/auth/auth.schema";
import { eq } from "drizzle-orm";

export type User = typeof user.$inferSelect;

export async function deleteUserByEmail(email: string): Promise<void> {
	await db.delete(user).where(eq(user.email, email.toLowerCase()));
}

export async function getUser(email: string): Promise<User | null> {
	const [foundUser] = await db
		.select()
		.from(user)
		.where(eq(user.email, email.toLowerCase()));
	return foundUser ?? null;
}

export { closeDb };
