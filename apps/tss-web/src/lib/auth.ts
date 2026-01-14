import { createAuthClient } from "better-auth/react";
import { env } from "src/env";
export const authClient = createAuthClient({
	/** The base URL of the server (optional if you're using the same domain) */
	baseURL: `${env.VITE_API_URL}/auth`,
});

export const { signIn, signUp, useSession } = authClient;
