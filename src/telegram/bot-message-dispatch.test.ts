import { beforeEach, describe, expect, it, vi } from "vitest";

const createTelegramDraftStream = vi.hoisted(() => vi.fn());
const dispatchReplyWithBufferedBlockDispatcher = vi.hoisted(() => vi.fn());
const deliverReplies = vi.hoisted(() => vi.fn());
const sendMessageTelegram = vi.hoisted(() => vi.fn().mockResolvedValue({ messageId: 999 }));
const editMessageTelegram = vi.hoisted(() => vi.fn());
const deleteMessageTelegram = vi.hoisted(() => vi.fn());

vi.mock("./draft-stream.js", () => ({
  createTelegramDraftStream: createTelegramDraftStream, // use hoisted var
  resolveTelegramDraftStreamingChunking: vi.fn(), // mock if needed
}));

vi.mock("../auto-reply/reply/provider-dispatcher.js", () => ({
  dispatchReplyWithBufferedBlockDispatcher: dispatchReplyWithBufferedBlockDispatcher, // use hoisted var
}));

vi.mock("./bot/delivery.js", () => ({
  deliverReplies: deliverReplies, // use hoisted var
}));

vi.mock("./sticker-cache.js", () => ({
  cacheSticker: vi.fn(),
  describeStickerImage: vi.fn(),
}));

vi.mock("./send.js", () => ({
  sendMessageTelegram: sendMessageTelegram,
  editMessageTelegram: editMessageTelegram,
  deleteMessageTelegram: deleteMessageTelegram,
}));

// Mock config imports
vi.mock("../config/types.js", () => ({}));
vi.mock("../agents/agent-scope.js", () => ({ resolveAgentDir: vi.fn() }));
vi.mock("../agents/model-catalog.js", () => ({
  findModelInCatalog: vi.fn(),
  loadModelCatalog: vi.fn(),
  modelSupportsVision: vi.fn(),
}));
vi.mock("../agents/model-selection.js", () => ({
  resolveDefaultModelForAgent: vi.fn().mockReturnValue({ provider: "mock", model: "mock" }),
}));
vi.mock("../auto-reply/chunk.js", () => ({ resolveChunkMode: vi.fn() }));
vi.mock("../auto-reply/reply/history.js", () => ({ clearHistoryEntriesIfEnabled: vi.fn() }));
vi.mock("../auto-reply/reply/placeholder.js", () => ({
  createPlaceholderController: () => ({
    start: vi.fn(),
    onTool: vi.fn(),
    cleanup: vi.fn(),
  }),
}));
vi.mock("../channels/ack-reactions.js", () => ({ removeAckReactionAfterReply: vi.fn() }));
vi.mock("../channels/logging.js", () => ({ logAckFailure: vi.fn(), logTypingFailure: vi.fn() }));
vi.mock("../channels/reply-prefix.js", () => ({
  createReplyPrefixContext: () => ({
    responsePrefix: "",
    responsePrefixContextProvider: () => ({}),
    onModelSelected: vi.fn(),
  }),
}));
vi.mock("../channels/typing.js", () => ({
  createTypingCallbacks: () => ({ onReplyStart: vi.fn() }),
}));
vi.mock("../config/markdown-tables.js", () => ({ resolveMarkdownTableMode: vi.fn() }));
vi.mock("../globals.js", () => ({ danger: vi.fn(), logVerbose: vi.fn() }));

// Import SUT after mocks
import { dispatchTelegramMessage } from "./bot-message-dispatch.js";

describe("dispatchTelegramMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTelegramDraftStream.mockReturnValue({
      update: vi.fn(),
      flush: vi.fn(),
      stop: vi.fn(),
      getMessageId: vi.fn(),
    });
  });

  const baseContext = {
    ctxPayload: {},
    primaryCtx: { message: { chat: { id: 123, type: "private" } } } as any,
    msg: { chat: { id: 123, type: "private" }, message_id: 456 } as any,
    chatId: 123,
    isGroup: false,
    threadSpec: { id: 777, scope: "dm" } as any,
    route: { agentId: "default", accountId: "default" },
    sendTyping: vi.fn(),
    sendRecordVoice: vi.fn(),
    placeholder: { enabled: false },
  } as any;

  it("handles model fallback alerts", async () => {
    dispatchReplyWithBufferedBlockDispatcher.mockImplementation(async ({ replyOptions }) => {
      // Trigger fallback
      await replyOptions?.onFallback?.(new Error("Rate limited"), {
        provider: "openai",
        model: "gpt-4",
      });
      return { queuedFinal: true };
    });

    await dispatchTelegramMessage({
      context: baseContext,
      bot: {} as any,
      cfg: {},
      runtime: {} as any,
      replyToMode: "first",
      streamMode: "off",
      textLimit: 4096,
      telegramCfg: {},
      opts: { token: "token" },
      resolveBotTopicsEnabled: async () => true,
    });

    expect(sendMessageTelegram).toHaveBeenCalledWith(
      "123",
      expect.stringContaining("⚠️ <b>Model Failed:</b> gpt-4 failed"),
      expect.objectContaining({ textMode: "html" }),
    );
  });

  it("updates draft status with model info", async () => {
    const draftUpdate = vi.fn();
    createTelegramDraftStream.mockReturnValue({
      update: draftUpdate,
      flush: vi.fn(),
      stop: vi.fn(),
      getMessageId: vi.fn(),
    });

    dispatchReplyWithBufferedBlockDispatcher.mockImplementation(async ({ replyOptions }) => {
      // Trigger model selection
      replyOptions?.onModelSelected?.({
        provider: "openai",
        model: "gpt-4o",
        thinkLevel: undefined,
      });
      return { queuedFinal: true };
    });

    await dispatchTelegramMessage({
      context: baseContext,
      bot: { api: {} } as any,
      cfg: {},
      runtime: {} as any,
      replyToMode: "first",
      streamMode: "partial",
      textLimit: 4096,
      telegramCfg: {},
      opts: { token: "token" },
      resolveBotTopicsEnabled: async () => true,
    });

    // Check updates
    expect(draftUpdate).toHaveBeenCalledWith(expect.stringContaining("🤖 Using <b>gpt-4o</b>"));
  });

  it("formats tool execution and results correctly", async () => {
    const draftUpdate = vi.fn();
    createTelegramDraftStream.mockReturnValue({
      update: draftUpdate,
      flush: vi.fn(),
      stop: vi.fn(),
      getMessageId: vi.fn(),
    });

    dispatchReplyWithBufferedBlockDispatcher.mockImplementation(async ({ replyOptions }) => {
      await replyOptions?.onToolStart?.("search", { q: "test" });
      await replyOptions?.onToolUpdate?.("search", { q: "test..." });
      await replyOptions?.onToolEnd?.({ toolName: "search", isError: false, result: "ok" });
      return { queuedFinal: true };
    });

    await dispatchTelegramMessage({
      context: baseContext,
      bot: { api: {} } as any,
      cfg: {},
      runtime: {} as any,
      replyToMode: "first",
      streamMode: "partial",
      textLimit: 4096,
      telegramCfg: {},
      opts: { token: "token" },
      resolveBotTopicsEnabled: async () => true,
    });

    expect(draftUpdate).toHaveBeenCalledWith(
      expect.stringContaining("🛠️ <b>Running search</b>..."),
    );
    expect(draftUpdate).toHaveBeenCalledWith(
      expect.stringContaining("✅ <b>search</b> finished..."),
    );
  });
});
