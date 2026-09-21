import { redactText } from "@projectgate/shared";

export interface LanguageModel {
  readonly id: string;
  complete(input: { system: string; prompt: string }): Promise<{ text: string; model: string }>;
}

export function modelFromEnv(env: NodeJS.ProcessEnv = process.env): LanguageModel | null {
  const apiKey = env["PROJECTGATE_LLM_API_KEY"];
  const baseUrl = env["PROJECTGATE_LLM_BASE_URL"];
  const model = env["PROJECTGATE_LLM_MODEL"];
  if (!apiKey || !baseUrl || !model) return null;
  return new OpenAiCompatibleModel(baseUrl, apiKey, model);
}

export class OpenAiCompatibleModel implements LanguageModel {
  readonly id = "openai-compatible";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(input: { system: string; prompt: string }): Promise<{ text: string; model: string }> {
    let response: Response;
    try {
      response = await fetch(joinUrl(this.baseUrl, "/chat/completions"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.prompt },
          ],
        }),
      });
    } catch (error) {
      throw new Error(`LLM request failed: ${redactText(error instanceof Error ? error.message : String(error)).text}`);
    }
    if (!response.ok) {
      const body = redactText(await response.text()).text.slice(0, 500);
      throw new Error(`LLM request failed with HTTP ${response.status}: ${body}`);
    }
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new Error("LLM response did not include text.");
    return { text, model: this.model };
  }
}

function joinUrl(base: string, suffix: string): string {
  return `${base.replace(/\/$/, "")}${suffix}`;
}
