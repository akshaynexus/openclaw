import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  createThinkingDisabledWrapper,
  needsRoleTransformation,
  transformDeveloperRole,
} from "./extra-params.js";

function makeModel(overrides: Partial<Model<Api>> = {}): Model<Api> {
  return {
    id: "test-model",
    name: "Test Model",
    provider: "anthropic",
    api: "anthropic-messages",
    reasoning: true,
    input: ["text"],
    maxTokens: 4096,
    contextWindow: 200_000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...overrides,
  } as Model<Api>;
}

describe("createThinkingDisabledWrapper", () => {
  it("injects thinking: disabled for anthropic-messages reasoning model", () => {
    const capturedPayloads: unknown[] = [];
    const baseFn: StreamFn = vi.fn((_model, _ctx, _options) => {
      return { push: vi.fn(), end: vi.fn() } as never;
    });

    const wrapped = createThinkingDisabledWrapper(baseFn, makeModel());
    void wrapped(
      makeModel(),
      { messages: [], tools: [] },
      {
        onPayload: (p) => capturedPayloads.push(p),
      },
    );

    expect(baseFn).toHaveBeenCalledOnce();

    const call = vi.mocked(baseFn).mock.calls[0];
    const optionsArg = call[2] as { onPayload?: (p: unknown) => void };
    const payload: Record<string, unknown> = { model: "test", max_tokens: 1024 };
    optionsArg.onPayload!(payload);

    expect(payload.thinking).toEqual({ type: "disabled" });
    expect(capturedPayloads).toHaveLength(1);
  });

  it("does not overwrite when thinking is already set", () => {
    const baseFn: StreamFn = vi.fn((_model, _ctx, _options) => {
      return { push: vi.fn(), end: vi.fn() } as never;
    });

    const wrapped = createThinkingDisabledWrapper(baseFn, makeModel());
    void wrapped(makeModel(), { messages: [], tools: [] }, {});

    const call = vi.mocked(baseFn).mock.calls[0];
    const optionsArg = call[2] as { onPayload?: (p: unknown) => void };
    const payload: Record<string, unknown> = {
      model: "test",
      thinking: { type: "enabled", budget_tokens: 1024 },
    };
    optionsArg.onPayload!(payload);

    expect(payload.thinking).toEqual({ type: "enabled", budget_tokens: 1024 });
  });

  it("does not overwrite explicit null thinking value", () => {
    const baseFn: StreamFn = vi.fn((_model, _ctx, _options) => {
      return { push: vi.fn(), end: vi.fn() } as never;
    });

    const wrapped = createThinkingDisabledWrapper(baseFn, makeModel());
    void wrapped(makeModel(), { messages: [], tools: [] }, {});

    const call = vi.mocked(baseFn).mock.calls[0];
    const optionsArg = call[2] as { onPayload?: (p: unknown) => void };
    const payload: Record<string, unknown> = { model: "test", thinking: null };
    optionsArg.onPayload!(payload);

    expect(payload.thinking).toBeNull();
  });

  it("returns base streamFn unchanged for non-reasoning model", () => {
    const baseFn: StreamFn = vi.fn();
    const result = createThinkingDisabledWrapper(baseFn, makeModel({ reasoning: false }));
    expect(result).toBe(baseFn);
  });

  it("returns base streamFn unchanged for non-anthropic API", () => {
    const baseFn: StreamFn = vi.fn();
    const result = createThinkingDisabledWrapper(
      baseFn,
      makeModel({ api: "openai-responses" as Api }),
    );
    expect(result).toBe(baseFn);
  });
});

describe("needsRoleTransformation", () => {
  it("returns true for DeepSeek models", () => {
    expect(needsRoleTransformation("openrouter", "deepseek/deepseek-chat")).toBe(true);
    expect(needsRoleTransformation("custom", "deepseek-coder")).toBe(true);
    expect(needsRoleTransformation("deepseek", "deepseek-chat-v3")).toBe(true);
    // Case insensitivity check
    expect(needsRoleTransformation("openrouter", "DeepSeek-R1")).toBe(true);
    expect(needsRoleTransformation("openrouter", "DEEPSEEK-LLM")).toBe(true);
  });

  it("returns false for OpenAI provider", () => {
    expect(needsRoleTransformation("openai", "gpt-4o")).toBe(false);
    expect(needsRoleTransformation("openai", "gpt-4")).toBe(false);
    expect(needsRoleTransformation("openai", "o1")).toBe(false);
    expect(needsRoleTransformation("openai", "o3-mini")).toBe(false);
  });

  it("returns false for Anthropic provider", () => {
    expect(needsRoleTransformation("anthropic", "claude-3-5-sonnet")).toBe(false);
    expect(needsRoleTransformation("anthropic", "claude-3-opus")).toBe(false);
  });

  it("returns false for Google provider", () => {
    expect(needsRoleTransformation("google", "gemini-pro")).toBe(false);
    expect(needsRoleTransformation("google", "gemini-ultra")).toBe(false);
  });

  it("returns false for unknown providers (safe default)", () => {
    expect(needsRoleTransformation("unknown", "some-model")).toBe(false);
    expect(needsRoleTransformation("custom", "custom-model")).toBe(false);
    expect(needsRoleTransformation("", "model")).toBe(false);
  });
});

describe("transformDeveloperRole", () => {
  it("transforms developer role to system role", () => {
    const messages = [
      { role: "developer", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
    ];
    const result = transformDeveloperRole(messages);
    expect(result[0].role).toBe("system");
    expect(result[0].content).toBe("You are a helpful assistant.");
    expect(result[1].role).toBe("user");
  });

  it("handles empty messages array", () => {
    const result = transformDeveloperRole([]);
    expect(result).toEqual([]);
  });

  it("preserves other roles", () => {
    const messages = [
      { role: "system", content: "System prompt" },
      { role: "user", content: "User message" },
      { role: "assistant", content: "Assistant response" },
    ];
    const result = transformDeveloperRole(messages);
    expect(result[0].role).toBe("system");
    expect(result[1].role).toBe("user");
    expect(result[2].role).toBe("assistant");
  });

  it("handles multiple developer messages", () => {
    const messages = [
      { role: "developer", content: "First instruction" },
      { role: "developer", content: "Second instruction" },
      { role: "user", content: "Hello" },
    ];
    const result = transformDeveloperRole(messages);
    expect(result[0].role).toBe("system");
    expect(result[1].role).toBe("system");
    expect(result[2].role).toBe("user");
  });
});
