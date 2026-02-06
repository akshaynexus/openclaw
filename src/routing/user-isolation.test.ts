import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { loadSessionStore, resolveStorePath, updateSessionStore } from "../config/sessions.js";
import { resolveAgentRoute } from "./resolve-route.js";

// Mock the state directory to avoid messing with actual user config
vi.mock("../config/paths.js", () => ({
  resolveStateDir: () => path.join(os.tmpdir(), "openclaw-test-" + randomUUID()),
}));

describe("User Isolation & Multi-Agent Routing", () => {
  test("two users have completely isolated agents and sessions with autoIsolateDms=true", async () => {
    const cfg: OpenClawConfig = {
      session: {
        autoIsolateDms: true,
        dmScope: "main", // Default
      },
      agents: {
        defaults: {
          workspace: "/tmp/openclaw-test/workspace",
        },
      },
    };

    // User A routes
    const routeA = resolveAgentRoute({
      cfg,
      channel: "telegram",
      peer: { kind: "dm", id: "userA" },
    });

    // User B routes
    const routeB = resolveAgentRoute({
      cfg,
      channel: "telegram",
      peer: { kind: "dm", id: "userB" },
    });

    // 1. Verify ID isolation
    expect(routeA.agentId).toBe("main-usera");
    expect(routeB.agentId).toBe("main-userb");
    expect(routeA.sessionKey).not.toBe(routeB.sessionKey);
    expect(routeA.sessionKey).toBe("agent:main-usera:main"); // normalized to lowercase
    expect(routeB.sessionKey).toBe("agent:main-userb:main");

    // 2. Verify workspace isolation
    const workspaceA = resolveAgentWorkspaceDir(cfg, routeA.agentId);
    const workspaceB = resolveAgentWorkspaceDir(cfg, routeB.agentId);
    expect(workspaceA).not.toBe(workspaceB);
    expect(workspaceA).toContain("workspace-main-usera");
    expect(workspaceB).toContain("workspace-main-userb");

    // 3. Verify session store isolation
    // We'll simulate updating a model override for User A and checking User B
    const storePathA = resolveStorePath(undefined, { agentId: routeA.agentId });
    const storePathB = resolveStorePath(undefined, { agentId: routeB.agentId });

    expect(storePathA).not.toBe(storePathB);

    // Initial state: empty
    expect(fs.existsSync(storePathA)).toBe(false);
    expect(fs.existsSync(storePathB)).toBe(false);

    // Update User A's session
    await updateSessionStore(storePathA, (store) => {
      store[routeA.sessionKey] = {
        sessionId: "session-a",
        updatedAt: Date.now(),
        modelOverride: "google/gemini-pro",
      };
    });

    // Check User A's store
    const storeA = loadSessionStore(storePathA);
    expect(storeA[routeA.sessionKey]?.modelOverride).toBe("google/gemini-pro");

    // Check User B's store remains empty or doesn't have User A's data
    if (fs.existsSync(storePathB)) {
      const storeB = loadSessionStore(storePathB);
      expect(storeB[routeB.sessionKey]).toBeUndefined();
    } else {
      // If file doesn't exist, it's definitely isolated
      expect(true).toBe(true);
    }
  });

  test("users sharing the same agent ID still have isolated sessions via dmScope", () => {
    // If autoIsolateDms is OFF, they share the agent but sessions should be unique
    const cfg: OpenClawConfig = {
      session: {
        autoIsolateDms: false,
        dmScope: "per-peer",
      },
    };

    const routeA = resolveAgentRoute({
      cfg,
      channel: "telegram",
      peer: { kind: "dm", id: "userA" },
    });

    const routeB = resolveAgentRoute({
      cfg,
      channel: "telegram",
      peer: { kind: "dm", id: "userB" },
    });

    // Sharing agent
    expect(routeA.agentId).toBe("main");
    expect(routeB.agentId).toBe("main");

    // Isolated session keys
    expect(routeA.sessionKey).toBe("agent:main:dm:usera");
    expect(routeB.sessionKey).toBe("agent:main:dm:userb");
    expect(routeA.sessionKey).not.toBe(routeB.sessionKey);
  });

  test("per-account isolation works correctly", () => {
    const cfg: OpenClawConfig = {
      session: {
        dmScope: "per-account-channel-peer",
      },
    };

    // User A on account "work"
    const routeA = resolveAgentRoute({
      cfg,
      channel: "telegram",
      accountId: "work",
      peer: { kind: "dm", id: "user123" },
    });

    // User A on account "personal"
    const routeB = resolveAgentRoute({
      cfg,
      channel: "telegram",
      accountId: "personal",
      peer: { kind: "dm", id: "user123" },
    });

    expect(routeA.sessionKey).toBe("agent:main:telegram:work:dm:user123");
    expect(routeB.sessionKey).toBe("agent:main:telegram:personal:dm:user123");
    expect(routeA.sessionKey).not.toBe(routeB.sessionKey);
  });

  test("model overrides are isolated between sessions sharing the same agent", async () => {
    const cfg: OpenClawConfig = {
      session: {
        autoIsolateDms: false,
        dmScope: "per-peer",
      },
    };

    const routeA = resolveAgentRoute({
      cfg,
      channel: "telegram",
      peer: { kind: "dm", id: "userA" },
    });
    const routeB = resolveAgentRoute({
      cfg,
      channel: "telegram",
      peer: { kind: "dm", id: "userB" },
    });

    const storePath = resolveStorePath(undefined, { agentId: "main" });

    // Set override for User A
    await updateSessionStore(storePath, (store) => {
      store[routeA.sessionKey] = {
        sessionId: "s1",
        updatedAt: Date.now(),
        modelOverride: "model-A",
      };
      store[routeB.sessionKey] = {
        sessionId: "s2",
        updatedAt: Date.now(),
        modelOverride: "model-B",
      };
    });

    const store = loadSessionStore(storePath);
    expect(store[routeA.sessionKey]?.modelOverride).toBe("model-A");
    expect(store[routeB.sessionKey]?.modelOverride).toBe("model-B");
  });

  test("cron jobs created by different users have isolated session keys", () => {
    const cfg: OpenClawConfig = {
      session: { autoIsolateDms: true },
    };

    const routeA = resolveAgentRoute({
      cfg,
      channel: "telegram",
      peer: { kind: "dm", id: "userA" },
    });
    const routeB = resolveAgentRoute({
      cfg,
      channel: "telegram",
      peer: { kind: "dm", id: "userB" },
    });

    // Simulate cron job run for User A
    // Cron keys are usually built as agent:<agentId>:cron:<jobId>
    const cronKeyA = `agent:${routeA.agentId}:cron:job123`.toLowerCase();
    const cronKeyB = `agent:${routeB.agentId}:cron:job123`.toLowerCase();

    expect(cronKeyA).toBe("agent:main-usera:cron:job123");
    expect(cronKeyB).toBe("agent:main-userb:cron:job123");
    expect(cronKeyA).not.toBe(cronKeyB);
  });
});
