import type { ProviderUsageSnapshot } from "./provider-usage.types.js";
import { PROVIDER_LABELS } from "./provider-usage.shared.js";

/**
 * Fetch OpenRouter usage info.
 * OpenRouter doesn't have a direct "remaining quota" API that maps to models easily,
 * but it has a credits API.
 */
export async function fetchOpenRouterUsage(
  token: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<ProviderUsageSnapshot> {
  const url = "https://openrouter.ai/api/v1/key";
  try {
    const res = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      if (res.status === 401) {
        return {
          provider: "openrouter",
          displayName: PROVIDER_LABELS.openrouter,
          windows: [],
          error: "Invalid API key",
        };
      }
      return {
        provider: "openrouter",
        displayName: PROVIDER_LABELS.openrouter,
        windows: [],
        error: `HTTP ${res.status}`,
      };
    }

    const json = (await res.json()) as {
      data: {
        usage: number;
        limit: number | null;
        limit_remaining: number | null;
        is_free_tier: boolean;
      };
    };

    const limit = json.data.limit;
    const remaining = json.data.limit_remaining;

    let usedPercent = 0;
    if (limit === null || limit === 0) {
      usedPercent = 0;
    } else if (remaining !== null) {
      usedPercent = ((limit - remaining) / limit) * 100;
    } else {
      usedPercent = (json.data.usage / limit) * 100;
    }

    return {
      provider: "openrouter",
      displayName: PROVIDER_LABELS.openrouter,
      windows: [
        {
          label: "Credits",
          usedPercent,
        },
        {
          label: json.data.is_free_tier ? "FreeTier" : "PaidTier",
          usedPercent: 0, // Label purpose
        },
      ],
    };
  } catch (err) {
    return {
      provider: "openrouter",
      displayName: PROVIDER_LABELS.openrouter,
      windows: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
