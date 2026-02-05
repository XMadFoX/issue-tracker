import { createOpenAI } from "@ai-sdk/openai";
import { env } from "../env";

export const openai = createOpenAI({
	baseURL: env.OPENAI_ENDPOINT,
	apiKey: env.OPENAI_API_KEY,
});
