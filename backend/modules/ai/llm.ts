import { ChatGoogle } from "@langchain/google";
import { env } from "../../config/env.js";

export function createChatModel() {
  if (env.LLM_PROVIDER === "google") {
    if (!env.GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY is required to use the Google Gemini provider");
    }

    return new ChatGoogle(env.LLM_MODEL, {
      apiKey: env.GOOGLE_API_KEY,
      temperature: env.LLM_TEMPERATURE,
      maxOutputTokens: env.LLM_MAX_TOKENS,
      thinkingLevel: "minimal",
    });
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${env.LLM_PROVIDER}`);
}
