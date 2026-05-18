import { httpTransportPayload } from "../app/persistence";
import type { UserSettings } from "../types";

export function aiConnectionPayload(settings: UserSettings, stream = false) {
  return {
    base_url: settings.ai.baseUrl,
    api_key: settings.ai.apiKey.trim() || null,
    ...httpTransportPayload(settings, stream)
  };
}
