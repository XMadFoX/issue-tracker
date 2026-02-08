import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import { env } from "../env";

export const openai = createOpenAI({
	baseURL: env.OPENAI_ENDPOINT,
	apiKey: env.OPENAI_API_KEY,
});

export async function embedText(text: string) {
	const { embedding } = await embed({
		model: openai.embedding(env.EMBEDDING_MODEL),
		value: text,
		providerOptions: {
			openai: {
				dimensions: 1536,
			},
		},
	});

	return embedding;
}
