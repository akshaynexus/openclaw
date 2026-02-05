import { describe, it, expect } from "vitest";
import { buildAllowedModelSet, modelKey } from "./model-selection.js";

describe("buildAllowedModelSet edge cases", () => {
  it("model NOT in catalog and provider NOT in models.providers IS NOW allowed (fix for #6295)", async () => {
    const cfg = {
      agents: {
        defaults: {
          models: {
            "google-antigravity/gemini-3-pro": {},
          },
        },
      },
      // Note: NO models.providers configured!
    };

    const mockCatalog: any[] = [];

    const allowed = buildAllowedModelSet({
      cfg: cfg as any,
      catalog: mockCatalog,
      defaultProvider: "anthropic",
      defaultModel: "claude-opus-4-5",
    });

    const testKey = modelKey("google-antigravity", "gemini-3-pro");

    // FIX: Models in agents.defaults.models are now always allowed
    console.log("allowedKeys:", [...allowed.allowedKeys]);
    console.log("testKey:", testKey);
    console.log("has testKey:", allowed.allowedKeys.has(testKey));

    // After fix: the model IS allowed
    expect(allowed.allowedKeys.has(testKey)).toBe(true);
  });

  it("model in catalog is allowed even without provider config", async () => {
    const cfg = {
      agents: {
        defaults: {
          models: {
            "google-antigravity/gemini-3-pro": {},
          },
        },
      },
    };

    // Model IS in catalog
    const mockCatalog: any[] = [
      { id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "google-antigravity" },
    ];

    const allowed = buildAllowedModelSet({
      cfg: cfg as any,
      catalog: mockCatalog,
      defaultProvider: "anthropic",
      defaultModel: "claude-opus-4-5",
    });

    const testKey = modelKey("google-antigravity", "gemini-3-pro");

    // When model is in catalog, it's allowed
    expect(allowed.allowedKeys.has(testKey)).toBe(true);
  });

  it("model with provider in models.providers is allowed", async () => {
    const cfg = {
      agents: {
        defaults: {
          models: {
            "google-antigravity/gemini-3-pro": {},
          },
        },
      },
      models: {
        providers: {
          "google-antigravity": {},
        },
      },
    };

    const mockCatalog: any[] = [];

    const allowed = buildAllowedModelSet({
      cfg: cfg as any,
      catalog: mockCatalog,
      defaultProvider: "anthropic",
      defaultModel: "claude-opus-4-5",
    });

    const testKey = modelKey("google-antigravity", "gemini-3-pro");

    // When provider is configured, model is allowed
    expect(allowed.allowedKeys.has(testKey)).toBe(true);
  });
});
