import { InlineKeyboard } from "grammy";
import { resolveOpenClawAgentDir } from "../../agents/agent-paths.js";
import { DEFAULT_PROVIDER } from "../../agents/defaults.js";
import { loadModelCatalog } from "../../agents/model-catalog.js";
import { buildAllowedModelSet, modelKey } from "../../agents/model-selection.js";
import { buildModelPickerItems } from "../../auto-reply/reply/directive-handling.model-picker.js";
import { OpenClawConfig } from "../../config/config.js";
import { formatUsageWindowSummary } from "../../infra/provider-usage.format.js";
import { loadProviderUsageSummary } from "../../infra/provider-usage.load.js";
import { resolveUsageProviderId } from "../../infra/provider-usage.shared.js";

const PAGE_SIZE = 10;

async function loadAndFilterCatalog(cfg: OpenClawConfig) {
  const catalog = await loadModelCatalog({ config: cfg, onlyAvailable: true });

  const { allowedKeys, allowAny } = buildAllowedModelSet({
    cfg,
    catalog,
    defaultProvider: DEFAULT_PROVIDER,
  });

  const allItems = buildModelPickerItems(catalog).filter((item) => {
    if (allowAny) {
      return true;
    }
    return allowedKeys.has(modelKey(item.provider, item.model));
  });

  return allItems;
}

export async function buildModelPickerMessage(params: {
  cfg: OpenClawConfig;
  page: number;
  provider: string;
  currentModel?: string; // e.g. "anthropic/claude-3-5-sonnet-20240620"
  agentId?: string;
  agentDir?: string;
}) {
  const allFilteredItems = await loadAndFilterCatalog(params.cfg);
  const allItems = allFilteredItems.filter((item) => item.provider === params.provider);

  const totalPages = Math.ceil(allItems.length / PAGE_SIZE);
  const page = Math.max(1, Math.min(params.page, totalPages));
  const start = (page - 1) * PAGE_SIZE;
  const items = allItems.slice(start, start + PAGE_SIZE);

  const lines = ["<b>Select a Model</b>", ""];

  // Fetch usage for this provider
  const usageProviderId = resolveUsageProviderId(params.provider);
  if (usageProviderId) {
    try {
      const usageSummary = await loadProviderUsageSummary({
        providers: [usageProviderId],
        agentDir: params.agentDir ?? resolveOpenClawAgentDir(),
      });
      const snapshot = usageSummary.providers.find((p) => p.provider === usageProviderId);
      if (snapshot && snapshot.windows.length > 0) {
        const usageLine = formatUsageWindowSummary(snapshot);
        if (usageLine) {
          lines.push(`Usage: ${usageLine}`);
          lines.push("");
        }
      }
    } catch {
      // ignore usage fetch errors in UI
    }
  }

  if (params.currentModel) {
    lines.push(`Current: <code>${params.currentModel}</code>`);
    lines.push("");
  }

  const keyboard = new InlineKeyboard();

  for (const item of items) {
    const key = `${item.provider}/${item.model}`;
    const label = `${item.provider}: ${item.model}`;
    const isSelected = params.currentModel === key;
    // Mark selected in label
    const btnLabel = isSelected ? `✅ ${label}` : label;

    // Callback data: mp:<provider>/<model>
    // Telegram callback_data limit is 64 bytes.
    let callbackData = `mp:${key}`;
    if (callbackData.length > 64) {
      // If still too long, try without provider prefix if possible,
      // but handler needs to know the provider.
      // For now, truncate to avoid Telegram rejecting the keyboard.
      callbackData = callbackData.slice(0, 64);
    }
    keyboard.text(btnLabel, callbackData).row();
  }

  // Pagination
  if (page > 1) {
    keyboard.text("« Prev", `pg:${params.provider}:${page - 1}`);
  }
  keyboard.text(`${page}/${totalPages}`, "noop");
  if (page < totalPages) {
    keyboard.text("Next »", `pg:${params.provider}:${page + 1}`);
  }
  keyboard.row().text("« Back to Providers", "pl");

  return {
    text: lines.join("\n"),
    reply_markup: keyboard,
  };
}
export async function buildProviderPickerMessage(params: {
  cfg: OpenClawConfig;
  currentProvider?: string;
}) {
  const allItems = await loadAndFilterCatalog(params.cfg);

  const providerMap = new Map<string, number>();
  for (const item of allItems) {
    providerMap.set(item.provider, (providerMap.get(item.provider) || 0) + 1);
  }

  const providers = Array.from(providerMap.keys()).toSorted((a, b) => a.localeCompare(b));

  const lines = ["<b>Select a Provider</b>", "", "Choose a provider to see available models:"];
  const keyboard = new InlineKeyboard();

  for (const provider of providers) {
    const count = providerMap.get(provider);
    const label = `${provider} (${count})`;
    keyboard.text(label, `pp:${provider}`).row();
  }

  return {
    text: lines.join("\n"),
    reply_markup: keyboard,
  };
}
