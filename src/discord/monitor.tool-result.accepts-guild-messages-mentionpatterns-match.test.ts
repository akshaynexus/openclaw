import type { Client } from "@buape/carbon";
import { ChannelType, MessageType } from "@buape/carbon";
import { Routes } from "discord-api-types/v10";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDiscordChannelInfoCacheForTest } from "./monitor/message-utils.js";

const sendMock = vi.fn();
const reactMock = vi.fn();
const updateLastRouteMock = vi.fn();
const dispatchMock = vi.fn();
const readAllowFromStoreMock = vi.fn();
const upsertPairingRequestMock = vi.fn();

vi.mock("./send.js", () => ({
  sendMessageDiscord: (...args: unknown[]) => sendMock(...args),
  reactMessageDiscord: async (...args: unknown[]) => {
    reactMock(...args);
  },
}));
vi.mock("../auto-reply/dispatch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auto-reply/dispatch.js")>();
  return {
    ...actual,
    dispatchInboundMessage: (...args: unknown[]) => dispatchMock(...args),
    dispatchInboundMessageWithDispatcher: (...args: unknown[]) => dispatchMock(...args),
    dispatchInboundMessageWithBufferedDispatcher: (...args: unknown[]) => dispatchMock(...args),
  };
});
vi.mock("../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: (...args: unknown[]) => readAllowFromStoreMock(...args),
  upsertChannelPairingRequest: (...args: unknown[]) => upsertPairingRequestMock(...args),
}));
vi.mock("../config/sessions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/sessions.js")>();
  return {
    ...actual,
    resolveStorePath: vi.fn(() => "/tmp/openclaw-sessions.json"),
    updateLastRoute: (...args: unknown[]) => updateLastRouteMock(...args),
    resolveSessionKey: vi.fn(),
  };
});

beforeEach(() => {
  vi.useRealTimers();
  sendMock.mockReset().mockResolvedValue(undefined);
  updateLastRouteMock.mockReset();
  dispatchMock.mockReset().mockImplementation(async ({ dispatcher }) => {
    dispatcher.sendFinalReply({ text: "hi" });
    return { queuedFinal: true, counts: { tool: 0, block: 0, final: 1 } };
  });
  readAllowFromStoreMock.mockReset().mockResolvedValue([]);
  upsertPairingRequestMock.mockReset().mockResolvedValue({ code: "PAIRCODE", created: true });
  __resetDiscordChannelInfoCacheForTest();
});

const MENTION_PATTERNS_TEST_TIMEOUT_MS = process.platform === "win32" ? 90_000 : 60_000;

describe("discord tool result dispatch", () => {
  it(
    "accepts guild messages when mentionPatterns match",
    async () => {
      const { createDiscordMessageHandler } = await import("./monitor.js");
      const cfg = {
        agents: {
          defaults: {
            model: "anthropic/claude-opus-4-5",
            workspace: "/tmp/openclaw",
          },
        },
        session: { store: "/tmp/openclaw-sessions.json" },
        channels: {
          discord: {
            dm: { enabled: true, policy: "open" },
            groupPolicy: "open",
            guilds: { "*": { requireMention: true } },
          },
        },
        messages: {
          responsePrefix: "PFX",
          groupChat: { mentionPatterns: ["\\bopenclaw\\b"] },
        },
      } as ReturnType<typeof import("../config/config.js").loadConfig>;

      const handler = createDiscordMessageHandler({
        cfg,
        discordConfig: cfg.channels.discord,
        accountId: "default",
        token: "token",
        runtime: {
          log: vi.fn(),
          error: vi.fn(),
          exit: (code: number): never => {
            throw new Error(`exit ${code}`);
          },
        } as unknown as any,
        botUserId: "bot-id",
        guildHistories: new Map(),
        historyLimit: 0,
        mediaMaxBytes: 10_000,
        textLimit: 2000,
        replyToMode: "off",
        dmEnabled: true,
        groupDmEnabled: false,
        guildEntries: { "*": { requireMention: true } },
      });

      const client = {
        fetchChannel: vi.fn().mockResolvedValue({
          type: ChannelType.GuildText,
          name: "general",
        }),
      } as unknown as Client;

      await handler(
        {
          message: {
            id: "m2",
            content: "openclaw: hello",
            channelId: "c1",
            timestamp: new Date().toISOString(),
            type: MessageType.Default,
            attachments: [],
            embeds: [],
            mentionedEveryone: false,
            mentionedUsers: [],
            mentionedRoles: [],
            author: { id: "u1", bot: false, username: "Ada" },
          },
          author: { id: "u1", bot: false, username: "Ada" },
          member: { nickname: "Ada" },
          guild: { id: "g1", name: "Guild" },
          guild_id: "g1",
        },
        client,
      );

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledTimes(1);
    },
    MENTION_PATTERNS_TEST_TIMEOUT_MS,
  );

  it(
    "accepts guild messages when mentionPatterns match even if another user is mentioned",
    async () => {
      const { createDiscordMessageHandler } = await import("./monitor.js");
      const cfg = {
        agents: {
          defaults: {
            model: "anthropic/claude-opus-4-5",
            workspace: "/tmp/openclaw",
          },
        },
        session: { store: "/tmp/openclaw-sessions.json" },
        channels: {
          discord: {
            dm: { enabled: true, policy: "open" },
            groupPolicy: "open",
            guilds: { "*": { requireMention: true } },
          },
        },
        messages: {
          responsePrefix: "PFX",
          groupChat: { mentionPatterns: ["\\bopenclaw\\b"] },
        },
      } as ReturnType<typeof import("../config/config.js").loadConfig>;

      const handler = createDiscordMessageHandler({
        cfg,
        discordConfig: cfg.channels.discord,
        accountId: "default",
        token: "token",
        runtime: {
          log: vi.fn(),
          error: vi.fn(),
          exit: (code: number): never => {
            throw new Error(`exit ${code}`);
          },
        } as unknown as any,
        botUserId: "bot-id",
        guildHistories: new Map(),
        historyLimit: 0,
        mediaMaxBytes: 10_000,
        textLimit: 2000,
        replyToMode: "off",
        dmEnabled: true,
        groupDmEnabled: false,
        guildEntries: { "*": { requireMention: true } },
      });

      const client = {
        fetchChannel: vi.fn().mockResolvedValue({
          type: ChannelType.GuildText,
          name: "general",
        }),
      } as unknown as Client;

      await handler(
        {
          message: {
            id: "m2-unique",
            content: "openclaw: hello",
            channelId: "c1",
            timestamp: new Date().toISOString(),
            type: MessageType.Default,
            attachments: [],
            embeds: [],
            mentionedEveryone: false,
            mentionedUsers: [{ id: "u2", bot: false, username: "Bea" }],
            mentionedRoles: [],
            author: { id: "u1", bot: false, username: "Ada" },
          },
          author: { id: "u1", bot: false, username: "Ada" },
          member: { nickname: "Ada" },
          guild: { id: "g1", name: "Guild" },
          guild_id: "g1",
        },
        client,
      );

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledTimes(1);
    },
    MENTION_PATTERNS_TEST_TIMEOUT_MS,
  );

  it("accepts guild reply-to-bot messages as implicit mentions", async () => {
    const { createDiscordMessageHandler } = await import("./monitor.js");
    const cfg = {
      agents: {
        defaults: {
          model: "anthropic/claude-opus-4-5",
          workspace: "/tmp/openclaw",
        },
      },
      session: { store: "/tmp/openclaw-sessions.json" },
      channels: {
        discord: {
          dm: { enabled: true, policy: "open" },
          groupPolicy: "open",
          guilds: { "*": { requireMention: true } },
        },
      },
    } as ReturnType<typeof import("../config/config.js").loadConfig>;

    const handler = createDiscordMessageHandler({
      cfg,
      discordConfig: cfg.channels!.discord,
      accountId: "default",
      token: "token",
      runtime: {
        log: vi.fn(),
        error: vi.fn(),
        exit: (code: number): never => {
          throw new Error(`exit ${code}`);
        },
      } as any,
      botUserId: "bot-id",
      guildHistories: new Map(),
      historyLimit: 0,
      mediaMaxBytes: 10_000,
      textLimit: 2000,
      replyToMode: "off",
      dmEnabled: true,
      groupDmEnabled: false,
      guildEntries: { "*": { requireMention: true } },
    });

    const client = {
      fetchChannel: vi.fn().mockResolvedValue({
        type: ChannelType.GuildText,
        name: "general",
      }),
    } as unknown as Client;

    await handler(
      {
        message: {
          id: "m3",
          content: "following up",
          channelId: "c1",
          timestamp: new Date().toISOString(),
          type: MessageType.Default,
          attachments: [],
          embeds: [],
          mentionedEveryone: false,
          mentionedUsers: [],
          mentionedRoles: [],
          author: { id: "u1", bot: false, username: "Ada" },
          referencedMessage: {
            id: "m2",
            channelId: "c1",
            content: "bot reply",
            timestamp: new Date().toISOString(),
            type: MessageType.Default,
            attachments: [],
            embeds: [],
            mentionedEveryone: false,
            mentionedUsers: [],
            mentionedRoles: [],
            author: { id: "bot-id", bot: true, username: "OpenClaw" },
          },
        } as any,
        author: { id: "u1", bot: false, username: "Ada" },
        member: { nickname: "Ada" } as any,
        guild: { id: "g1", name: "Guild" } as any,
        guild_id: "g1",
      } as any,
      client,
    );

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const payload = dispatchMock.mock.calls[0]?.[0]?.ctx as Record<string, unknown>;
    expect(payload.WasMentioned).toBe(true);
  });

  it("skips thread starter context when disabled", async () => {
    const { createDiscordMessageHandler } = await import("./monitor.js");
    let capturedCtx: any;
    dispatchMock.mockImplementationOnce(async ({ ctx, dispatcher }) => {
      capturedCtx = ctx;
      dispatcher.sendFinalReply({ text: "hi" });
      return { queuedFinal: true, counts: { final: 1 } };
    });

    const cfg = {
      agents: {
        defaults: {
          model: "anthropic/claude-opus-4-5",
          workspace: "/tmp/openclaw",
        },
      },
      session: { store: "/tmp/openclaw-sessions.json" },
      channels: {
        discord: {
          dm: { enabled: true, policy: "open" },
          groupPolicy: "open",
          guilds: {
            "*": {
              requireMention: false,
              channels: {
                "*": { includeThreadStarter: false },
              },
            },
          },
        },
      },
    } as ReturnType<typeof import("../config/config.js").loadConfig>;

    const handler = createDiscordMessageHandler({
      cfg,
      discordConfig: cfg.channels!.discord,
      accountId: "default",
      token: "token",
      runtime: {
        log: vi.fn(),
        error: vi.fn(),
        exit: (code: number): never => {
          throw new Error(`exit ${code}`);
        },
      } as any,
      botUserId: "bot-id",
      guildHistories: new Map(),
      historyLimit: 0,
      mediaMaxBytes: 10_000,
      textLimit: 2000,
      replyToMode: "off",
      dmEnabled: true,
      groupDmEnabled: false,
      guildEntries: cfg.channels!.discord!.guilds! as any,
    });

    const threadChannel = {
      type: ChannelType.GuildText,
      name: "thread-name",
      parentId: "p1",
      parent: { id: "p1", name: "general" },
      isThread: () => true,
    } as any;

    const client = {
      fetchChannel: vi.fn().mockResolvedValue(threadChannel),
      rest: {
        get: vi.fn().mockResolvedValue({
          content: "starter message",
          author: { id: "u1", username: "Alice", discriminator: "0001" },
          timestamp: new Date().toISOString(),
        }),
      },
    } as unknown as Client;

    await handler(
      {
        message: {
          id: "m7",
          content: "thread reply",
          channelId: "t1",
          channel: threadChannel,
          timestamp: new Date().toISOString(),
          type: MessageType.Default,
          attachments: [],
          embeds: [],
          mentionedEveryone: false,
          mentionedUsers: [],
          mentionedRoles: [],
          author: { id: "u2", bot: false, username: "Bob", tag: "Bob#2" },
        } as any,
        author: { id: "u2", bot: false, username: "Bob" } as any,
        member: { nickname: "Bob" } as any,
        guild: { id: "g1", name: "Guild" } as any,
        guild_id: "g1",
      } as any,
      client,
    );

    expect(capturedCtx?.ThreadStarterBody).toBeUndefined();
  });

  it("treats forum threads as distinct sessions without channel payloads", async () => {
    const { createDiscordMessageHandler } = await import("./monitor.js");
    let capturedCtx: any;
    dispatchMock.mockImplementationOnce(async ({ ctx, dispatcher }) => {
      capturedCtx = ctx;
      dispatcher.sendFinalReply({ text: "hi" });
      return { queuedFinal: true, counts: { final: 1 } };
    });

    const cfg = {
      agents: {
        defaults: {
          model: "anthropic/claude-opus-4-5",
          workspace: "/tmp/openclaw",
        },
      },
      session: { store: "/tmp/openclaw-sessions.json" },
      channels: {
        discord: {
          dm: { enabled: true, policy: "open" },
          groupPolicy: "open",
          guilds: { "*": { requireMention: false } },
        },
      },
      routing: { allowFrom: [] },
    } as ReturnType<typeof import("../config/config.js").loadConfig>;

    const handler = createDiscordMessageHandler({
      cfg,
      discordConfig: cfg.channels!.discord,
      accountId: "default",
      token: "token",
      runtime: {
        log: vi.fn(),
        error: vi.fn(),
        exit: (code: number): never => {
          throw new Error(`exit ${code}`);
        },
      } as any,
      botUserId: "bot-id",
      guildHistories: new Map(),
      historyLimit: 0,
      mediaMaxBytes: 10_000,
      textLimit: 2000,
      replyToMode: "off",
      dmEnabled: true,
      groupDmEnabled: false,
      guildEntries: { "*": { requireMention: false } } as any,
    });

    const fetchChannel = vi
      .fn()
      .mockResolvedValueOnce({
        type: ChannelType.PublicThread,
        name: "topic-1",
        parentId: "forum-1",
      } as any)
      .mockResolvedValueOnce({
        type: ChannelType.GuildForum,
        name: "support",
      } as any);

    const client = {
      fetchChannel,
      rest: {
        get: vi.fn().mockResolvedValue({
          content: "starter message",
          author: { id: "u1", username: "Alice", discriminator: "0001" },
          timestamp: new Date().toISOString(),
        }),
      },
    } as unknown as Client;

    await handler(
      {
        message: {
          id: "m6",
          content: "thread reply",
          channelId: "t1",
          timestamp: new Date().toISOString(),
          type: MessageType.Default,
          attachments: [],
          embeds: [],
          mentionedEveryone: false,
          mentionedUsers: [],
          mentionedRoles: [],
          author: { id: "u2", bot: false, username: "Bob", tag: "Bob#2" },
        } as any,
        author: { id: "u2", bot: false, username: "Bob" } as any,
        member: { nickname: "Bob" } as any,
        guild: { id: "g1", name: "Guild" } as any,
        guild_id: "g1",
      } as any,
      client,
    );

    expect(capturedCtx?.SessionKey).toBe("agent:main:discord:channel:t1");
    expect(capturedCtx?.ParentSessionKey).toBe("agent:main:discord:channel:forum-1");
    expect(capturedCtx?.ThreadStarterBody).toContain("starter message");
    expect(capturedCtx?.ThreadLabel).toContain("Discord thread #support");
  });

  it("forks thread sessions and injects starter context", async () => {
    const { createDiscordMessageHandler } = await import("./monitor.js");
    let capturedCtx: any;
    dispatchMock.mockImplementationOnce(async ({ ctx, dispatcher }) => {
      capturedCtx = ctx;
      dispatcher.sendFinalReply({ text: "hi" });
      return { queuedFinal: true, counts: { final: 1 } };
    });

    const cfg = {
      agents: {
        defaults: {
          model: "anthropic/claude-opus-4-5",
          workspace: "/tmp/openclaw",
        },
      },
      session: { store: "/tmp/openclaw-sessions.json" },
      messages: { responsePrefix: "PFX" },
      channels: {
        discord: {
          dm: { enabled: true, policy: "open" },
          groupPolicy: "open",
          guilds: { "*": { requireMention: false } },
        },
      },
    } as ReturnType<typeof import("../config/config.js").loadConfig>;

    const handler = createDiscordMessageHandler({
      cfg,
      discordConfig: cfg.channels!.discord,
      accountId: "default",
      token: "token",
      runtime: {
        log: vi.fn(),
        error: vi.fn(),
        exit: (code: number): never => {
          throw new Error(`exit ${code}`);
        },
      } as any,
      botUserId: "bot-id",
      guildHistories: new Map(),
      historyLimit: 0,
      mediaMaxBytes: 10_000,
      textLimit: 2000,
      replyToMode: "off",
      dmEnabled: true,
      groupDmEnabled: false,
      guildEntries: { "*": { requireMention: false } } as any,
    });

    const threadChannel = {
      type: ChannelType.GuildText,
      name: "thread-name",
      parentId: "p1",
      parent: { id: "p1", name: "general" },
      isThread: () => true,
    } as any;

    const client = {
      fetchChannel: vi.fn().mockResolvedValue(threadChannel),
      rest: {
        get: vi.fn().mockResolvedValue({
          content: "starter message",
          author: { id: "u1", username: "Alice", discriminator: "0001" },
          timestamp: new Date().toISOString(),
        }),
      },
    } as unknown as Client;

    await handler(
      {
        message: {
          id: "m4",
          content: "thread reply",
          channelId: "t1",
          channel: threadChannel,
          timestamp: new Date().toISOString(),
          type: MessageType.Default,
          attachments: [],
          embeds: [],
          mentionedEveryone: false,
          mentionedUsers: [],
          mentionedRoles: [],
          author: { id: "u2", bot: false, username: "Bob", tag: "Bob#2" },
        } as any,
        author: { id: "u2", bot: false, username: "Bob" } as any,
        member: { nickname: "Bob" } as any,
        guild: { id: "g1", name: "Guild" } as any,
        guild_id: "g1",
      } as any,
      client,
    );

    expect(capturedCtx?.SessionKey).toBe("agent:main:discord:channel:t1");
    expect(capturedCtx?.ParentSessionKey).toBe("agent:main:discord:channel:p1");
    expect(capturedCtx?.ThreadStarterBody).toContain("starter message");
    expect(capturedCtx?.ThreadLabel).toContain("Discord thread #general");
  });

  it("scopes thread sessions to the routed agent", async () => {
    const { createDiscordMessageHandler } = await import("./monitor.js");
    let capturedCtx: any;
    dispatchMock.mockImplementationOnce(async ({ ctx, dispatcher }) => {
      capturedCtx = ctx;
      dispatcher.sendFinalReply({ text: "hi" });
      return { queuedFinal: true, counts: { final: 1 } };
    });

    const cfg = {
      agents: {
        defaults: {
          model: "anthropic/claude-opus-4-5",
          workspace: "/tmp/openclaw",
        },
      },
      session: { store: "/tmp/openclaw-sessions.json" },
      messages: { responsePrefix: "PFX" },
      channels: {
        discord: {
          dm: { enabled: true, policy: "open" },
          groupPolicy: "open",
          guilds: { "*": { requireMention: false } },
        },
      },
      bindings: [{ agentId: "support", match: { channel: "discord", guildId: "g1" } }],
    } as ReturnType<typeof import("../config/config.js").loadConfig>;

    const handler = createDiscordMessageHandler({
      cfg,
      discordConfig: cfg.channels!.discord,
      accountId: "default",
      token: "token",
      runtime: {
        log: vi.fn(),
        error: vi.fn(),
        exit: (code: number): never => {
          throw new Error(`exit ${code}`);
        },
      } as any,
      botUserId: "bot-id",
      guildHistories: new Map(),
      historyLimit: 0,
      mediaMaxBytes: 10_000,
      textLimit: 2000,
      replyToMode: "off",
      dmEnabled: true,
      groupDmEnabled: false,
      guildEntries: { "*": { requireMention: false } } as any,
    });

    const threadChannel = {
      type: ChannelType.GuildText,
      name: "thread-name",
      parentId: "p1",
      parent: { id: "p1", name: "general" },
      isThread: () => true,
    } as any;

    const client = {
      fetchChannel: vi.fn().mockResolvedValue(threadChannel),
      rest: {
        get: vi.fn().mockResolvedValue({
          content: "starter message",
          author: { id: "u1", username: "Alice", discriminator: "0001" },
          timestamp: new Date().toISOString(),
        }),
      },
    } as unknown as Client;

    await handler(
      {
        message: {
          id: "m5",
          content: "thread reply",
          channelId: "t1",
          channel: threadChannel,
          timestamp: new Date().toISOString(),
          type: MessageType.Default,
          attachments: [],
          embeds: [],
          mentionedEveryone: false,
          mentionedUsers: [],
          mentionedRoles: [],
          author: { id: "u2", bot: false, username: "Bob", tag: "Bob#2" },
        } as any,
        author: { id: "u2", bot: false, username: "Bob" } as any,
        member: { nickname: "Bob" } as any,
        guild: { id: "g1", name: "Guild" } as any,
        guild_id: "g1",
      } as any,
      client,
    );

    expect(capturedCtx?.SessionKey).toBe("agent:support:discord:channel:t1");
    expect(capturedCtx?.ParentSessionKey).toBe("agent:support:discord:channel:p1");
  });
});
