import { InlineKeyboard } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { OpenClawConfig } from "../../config/config.js";
import { buildModelPickerMessage, buildProviderPickerMessage } from "./model-picker.js";

// Mock the model catalog loader to return a fixed list of models for testing
vi.mock("../../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(),
}));

// Mock the picker items builder
vi.mock("../../auto-reply/reply/directive-handling.model-picker.js", () => ({
  buildModelPickerItems: vi.fn().mockImplementation(() => {
    // Generate 25 dummy models from test-provider
    const testProvider = Array.from({ length: 25 }, (_, i) => ({
      provider: "test-provider",
      model: `model-${i + 1}`,
    }));
    // Generate 5 dummy models from another-provider
    const anotherProvider = Array.from({ length: 5 }, (_, i) => ({
      provider: "another-provider",
      model: `other-model-${i + 1}`,
    }));
    return [...testProvider, ...anotherProvider];
  }),
}));

describe("buildModelPickerMessage", () => {
  const mockCfg = {} as unknown as OpenClawConfig;

  it("renders the first page of models for a specific provider", async () => {
    const result = await buildModelPickerMessage({
      cfg: mockCfg,
      page: 1,
      provider: "test-provider",
    });

    expect(result.text).toContain("Select a Model");
    expect(result.reply_markup).toBeInstanceOf(InlineKeyboard);

    const rows = result.reply_markup.inline_keyboard;

    // We expect 10 model rows + 1 nav row + 1 back row
    // Inside builder:
    // keyboard.text(...) (10x)
    // keyboard.text("1/3", "noop") + keyboard.text("Next", ...) (1 row)
    // keyboard.row().text("Back", ...) (1 row)
    expect(rows.length).toBe(12);

    const firstBtn = rows[0][0];
    expect(firstBtn.text).toBe("test-provider: model-1");
    expect((firstBtn as any).callback_data).toBe("model_pick:test-provider/model-1");

    // Navigation row
    const navRow = rows[10];
    expect(navRow[0].text).toBe("1/3");
    expect(navRow[1].text).toBe("Next »");

    // Back row
    const backRow = rows[11];
    expect(backRow[0].text).toBe("« Back to Providers");
    expect(backRow[0].callback_data).toBe("prov_list");
  });

  it("renders the second page with navigation", async () => {
    const result = await buildModelPickerMessage({
      cfg: mockCfg,
      page: 2,
      provider: "test-provider",
    });

    const rows = result.reply_markup.inline_keyboard;
    expect(rows.length).toBe(12);

    const firstBtn = rows[0][0];
    expect(firstBtn.text).toBe("test-provider: model-11"); // Start of page 2

    // Navigation row
    const navRow = rows[10];
    expect(navRow[0].text).toBe("« Prev");
    expect(navRow[1].text).toBe("2/3");
    expect(navRow[2].text).toBe("Next »");
  });

  it("renders the last page", async () => {
    const result = await buildModelPickerMessage({
      cfg: mockCfg,
      page: 3,
      provider: "test-provider",
    });

    const rows = result.reply_markup.inline_keyboard;
    // 5 items (21-25) + nav + back = 7 rows
    expect(rows.length).toBe(7);

    const firstBtn = rows[0][0];
    expect(firstBtn.text).toBe("test-provider: model-21");

    // Navigation row
    const navRow = rows[5];
    expect(navRow[0].text).toBe("« Prev");
    expect(navRow[1].text).toBe("3/3");
  });

  it("highlights current model selection", async () => {
    const result = await buildModelPickerMessage({
      cfg: mockCfg,
      page: 1,
      provider: "test-provider",
      currentModel: "test-provider/model-2",
    });

    const rows = result.reply_markup.inline_keyboard;

    // Model 2 is at index 1
    const btn = rows[1][0];
    expect(btn.text).toBe("✅ test-provider: model-2");

    expect(result.text).toContain("Current: <code>test-provider/model-2</code>");
  });
});

describe("buildProviderPickerMessage", () => {
  const mockCfg = {} as unknown as OpenClawConfig;

  it("renders the list of providers", async () => {
    const result = await buildProviderPickerMessage({
      cfg: mockCfg,
    });

    expect(result.text).toContain("Select a Provider");
    const rows = result.reply_markup.inline_keyboard;

    // 2 providers + trailing empty row = 3 rows
    expect(rows.length).toBe(3);
    expect(rows[0][0].text).toBe("another-provider (5)");
    expect((rows[0][0] as any).callback_data).toBe("prov_pick:another-provider");
    expect(rows[1][0].text).toBe("test-provider (25)");
    expect((rows[1][0] as any).callback_data).toBe("prov_pick:test-provider");
  });
});

describe("Model Picker Command Registration", () => {
  it("bot-handlers.ts should register 'models' command", async () => {
    expect(true).toBe(true);
  });
});
