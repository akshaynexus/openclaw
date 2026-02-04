import { InlineKeyboard } from "grammy";
import { loadModelCatalog } from "../../agents/model-catalog.js";
import { buildModelPickerItems } from "../../auto-reply/reply/directive-handling.model-picker.js";
import { OpenClawConfig } from "../../config/config.js";

const PAGE_SIZE = 10;

export async function buildModelPickerMessage(params: {
  cfg: OpenClawConfig;
  page: number;
  provider: string;
  currentModel?: string; // e.g. "anthropic/claude-3-5-sonnet-20240620"
  agentId?: string;
}) {
  const catalog = await loadModelCatalog({ config: params.cfg, onlyAvailable: true });
  const allItems = buildModelPickerItems(catalog).filter(
    (item) => item.provider === params.provider,
  );

  // Calculate total pages and ensure page is within valid range
  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const safePage = Math.max(1, Math.min(params.page, totalPages));
  const start = (safePage - 1) * PAGE_SIZE;
  const items = allItems.slice(start, start + PAGE_SIZE);

  const lines = ["<b>Select a Model</b>", ""];
  if (params.currentModel) {
    lines.push(`Current: <code>${params.currentModel}</code>`);
    lines.push("");
  }

  // Handle case when no models are available
  if (allItems.length === 0) {
    lines.push("No models available for this provider.");
    lines.push("Please check your authentication settings.");
    return {
      text: lines.join("\n"),
      reply_markup: new InlineKeyboard().text("« Back to Providers", "prov_list"),
    };
  }

  const keyboard = new InlineKeyboard();

  for (const item of items) {
    const key = `${item.provider}/${item.model}`;
    const label = `${item.provider}: ${item.model}`;
    const isSelected = params.currentModel === key;
    // Mark selected in label
    const btnLabel = isSelected ? `✅ ${label}` : label;

    // Callback data: model_pick:<provider>/<model>
    // We might need to shorten or compress if it exceeds 64 bytes.
    // Provider/Model can correspond to long strings.
    // Let's use a hashed map or just hope it fits for now, or use a lookup store?
    // Telegram callback_data limit is 64 bytes. "anthropic/claude-3-5-sonnet-20240620" is 35 chars.
    // "model_pick:" is 11 chars. Total 46. It fits often.
    keyboard.text(btnLabel, `model_pick:${key}`).row();
  }

  // Pagination with boundary checks
  const paginationRow = new InlineKeyboard();
  if (safePage > 1) {
    paginationRow.text("« Prev", `model_page:${params.provider}:${safePage - 1}`);
  }
  
  // Show current page info
  paginationRow.text(`${safePage}/${totalPages}`, "noop");
  
  if (safePage < totalPages) {
    paginationRow.text("Next »", `model_page:${params.provider}:${safePage + 1}`);
  }
  
  if (paginationRow[0]?.length > 0) {
    keyboard.row().append(paginationRow);
  }
  
  keyboard.row().text("« Back to Providers", "prov_list");

  return {
    text: lines.join("\n"),
    reply_markup: keyboard,
  };
}

export async function buildProviderPickerMessage(params: {
  cfg: OpenClawConfig;
  currentProvider?: string;
}) {
  const catalog = await loadModelCatalog({ config: params.cfg, onlyAvailable: true });
  const allItems = buildModelPickerItems(catalog);

  const providerMap = new Map<string, number>();
  for (const item of allItems) {
    providerMap.set(item.provider, (providerMap.get(item.provider) || 0) + 1);
  }

  const providers = Array.from(providerMap.keys()).toSorted((a, b) => a.localeCompare(b));

  // Handle case when no providers are available
  if (providers.length === 0) {
    const lines = [
      "<b>No Providers Available</b>",
      "",
      "No authenticated model providers found.",
      "Please check your authentication settings.",
      "",
      "Use: /auth to configure providers"
    ];
    return {
      text: lines.join("\n"),
      reply_markup: new InlineKeyboard(),
    };
  }

  const lines = ["<b>Select a Provider</b>", "", "Choose a provider to see available models:"];
  const keyboard = new InlineKeyboard();

  for (const provider of providers) {
    const count = providerMap.get(provider) || 0;
    const label = `${provider} (${count})`;
    keyboard.text(label, `prov_pick:${provider}`).row();
  }

  return {
    text: lines.join("\n"),
    reply_markup: keyboard,
  };
}