import { describe, it, expect, vi } from "vitest";
import type { CopilotClient, ModelInfo } from "@github/copilot-sdk";
import { selectModel, MODEL_PREFERENCE, FALLBACK_MODEL } from "../../src/analyzer/model.js";

function makeModel(id: string, overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    id,
    name: id,
    capabilities: {
      supports: { vision: false, reasoningEffort: false },
      limits: { max_context_window_tokens: 128000 },
    },
    ...overrides,
  } as ModelInfo;
}

function makeClient(models: ModelInfo[] | Error): CopilotClient {
  return {
    listModels: vi.fn(() =>
      models instanceof Error ? Promise.reject(models) : Promise.resolve(models),
    ),
  } as unknown as CopilotClient;
}

describe("selectModel", () => {
  it("uses the explicit override without querying models", async () => {
    const client = makeClient([makeModel("gpt-5")]);
    const model = await selectModel(client, "claude-sonnet-4.5");
    expect(model).toBe("claude-sonnet-4.5");
    expect(client.listModels).not.toHaveBeenCalled();
  });

  it("picks the highest-preference model available in the subscription", async () => {
    const client = makeClient([
      makeModel("gpt-4o"),
      makeModel("claude-sonnet-4.5"),
      makeModel("gpt-4.1"),
    ]);
    expect(await selectModel(client)).toBe("claude-sonnet-4.5");
  });

  it("picks gpt-5 first when available", async () => {
    const client = makeClient(MODEL_PREFERENCE.map((id) => makeModel(id)));
    expect(await selectModel(client)).toBe("gpt-5");
  });

  it("skips models disabled by policy", async () => {
    const client = makeClient([
      makeModel("gpt-5", { policy: { state: "disabled", terms: "" } }),
      makeModel("gpt-4.1", { policy: { state: "enabled", terms: "" } }),
    ]);
    expect(await selectModel(client)).toBe("gpt-4.1");
  });

  it("skips embedding models", async () => {
    const client = makeClient([
      makeModel("text-embedding-3-small"),
      makeModel("some-chat-model"),
    ]);
    expect(await selectModel(client)).toBe("some-chat-model");
  });

  it("falls back to the first usable model when no preferred model matches", async () => {
    const client = makeClient([makeModel("custom-model-a"), makeModel("custom-model-b")]);
    expect(await selectModel(client)).toBe("custom-model-a");
  });

  it("falls back to FALLBACK_MODEL when listModels() fails", async () => {
    const client = makeClient(new Error("RPC unavailable"));
    expect(await selectModel(client)).toBe(FALLBACK_MODEL);
  });

  it("falls back to FALLBACK_MODEL when no usable models are listed", async () => {
    const client = makeClient([makeModel("text-embedding-3-small")]);
    expect(await selectModel(client)).toBe(FALLBACK_MODEL);
  });
});
