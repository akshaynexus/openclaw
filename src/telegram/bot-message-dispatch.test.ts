import type { Bot } from "grammy";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createTelegramDraftStream = vi.hoisted(() => vi.fn());
const dispatchReplyWithBufferedBlockDispatcher = vi.hoisted(() => vi.fn());
const deliverReplies = vi.hoisted(() => vi.fn());

vi.mock("./draft-stream.js", () => ({
  createTelegramDraftStream,
}));

vi.mock("../auto-reply/reply/provider-dispatcher.js", () => ({
  dispatchReplyWithBufferedBlockDispatcher,
}));

vi.mock("./bot/delivery.js", () => ({
  deliverReplies,
}));

vi.mock("./sticker-cache.js", () => ({
  cacheSticker: vi.fn(),
  describeStickerImage: vi.fn(),
}));

import { dispatchTelegramMessage } from "./bot-message-dispatch.js";

describe("dispatchTelegramMessage draft streaming", () => {
  beforeEach(() => {
    createTelegramDraftStream.mockReset();
    dispatchReplyWithBufferedBlockDispatcher.mockReset();
    deliverReplies.mockReset();
  });

  it("streams tool status, reasoning, and final reply correctly", async () => {
    const draftStream = {
      update: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      getMessageId: vi.fn().mockReturnValue(999),
    };
    createTelegramDraftStream.mockReturnValue(draftStream);

    dispatchReplyWithBufferedBlockDispatcher.mockImplementation(
      async ({ dispatcherOptions, replyOptions }) => {
        // 1. Tool start
        await replyOptions?.onToolStart?.("search_web", { query: "telegram" });
        // 2. Reasoning stream
        await replyOptions?.onReasoningStream?.({ text: "Reasoning:\nI will search." });
        // 3. Partial reply
        await replyOptions?.onPartialReply?.({ text: "Found info." });
        // 4. Final reply
        await dispatcherOptions.deliver({ text: "Final answer." }, { kind: "final" });
        return { queuedFinal: true };
      },
    );
    deliverReplies.mockResolvedValue({ delivered: true });

    const resolveBotTopicsEnabled = vi.fn().mockResolvedValue(true);
    const context = {
      ctxPayload: {},
      primaryCtx: { message: { chat: { id: 123, type: "private" } } },
      msg: { chat: { id: 123, type: "private" }, message_id: 456 },
      chatId: 123,
      isGroup: false,
      threadSpec: { id: 777, scope: "dm" },
      route: { agentId: "default", accountId: "default" },
      sendTyping: vi.fn(),
      sendRecordVoice: vi.fn(),
      placeholder: { enabled: false },
    };

    const bot = { api: { sendMessageDraft: vi.fn() } } as unknown as Bot;
    const runtime = {
      log: vi.fn(),
      error: vi.fn(),
      exit: () => {
        throw new Error("exit");
      },
    };

    await dispatchTelegramMessage({
      context,
      bot,
      cfg: {},
      runtime,
      replyToMode: "first",
      streamMode: "partial",
      textLimit: 4096,
      telegramCfg: {},
      opts: { token: "token" },
      resolveBotTopicsEnabled,
    });

    // Verify updates (simplified checking of last calls)
    const updates = draftStream.update.mock.calls.map((c) => c[0]);
    expect(updates).toContain("🛠️ *Running search_web*...");
    expect(updates).toContain("🛠️ *Running search_web*...\n\n<think>I will search.</think>");
    expect(updates).toContain(
      "🛠️ *Running search_web*...\n\n<think>I will search.</think>\nFound info.",
    );

    // Verify final reply
    expect(deliverReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        replies: [{ text: "Final answer." }],
        editMessageId: 999,
      }),
    );
  });
});
