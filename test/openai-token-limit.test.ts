import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../src/providers/openai.js";

vi.mock("../src/config.js", () => ({ getEnvVar: () => undefined }));

afterEach(() => vi.restoreAllMocks());

describe.each([
  ["https://api.openai.com", "gpt-5.6-luna", "max_completion_tokens"],
  ["https://api.openai.com/v1", "gpt-4o", "max_completion_tokens"],
  [
    "https://resource.openai.azure.com/openai/deployments/custom-name",
    "custom-name",
    "max_completion_tokens",
  ],
  ["http://localhost:11434/v1", "local-model", "max_tokens"],
  ["https://api.openai.com.proxy.example/v1", "custom-model", "max_tokens"],
])("OpenAI token budget at %s", (baseUrl, model, tokenField) => {
  it.each(["compress", "summarize"] as const)(
    "sends the supported token limit for %s",
    async (operation) => {
      let body: unknown;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return Response.json({ choices: [{ message: { content: "OK" } }] });
      });
      const provider = new OpenAIProvider("test-key", model, 256, baseUrl);

      await expect(provider[operation]("system", "user")).resolves.toBe("OK");
      expect(body).toEqual({
        model,
        [tokenField]: 256,
        stream: false,
        messages: [
          { role: "system", content: "system" },
          { role: "user", content: "user" },
        ],
      });
    },
  );
});
