/** OpenAI-compatible API base URLs (sorted alphabetically by label). */
export type AiProviderPreset = {
  id: string;
  label: string;
  baseUrl: string;
};

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  { id: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com/v1" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  { id: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { id: "lmstudio", label: "LM Studio (local)", baseUrl: "http://127.0.0.1:1234/v1" },
  { id: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
  { id: "ollama", label: "Ollama (local)", baseUrl: "http://127.0.0.1:11434/v1" },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "routellm", label: "RouteLLM", baseUrl: "https://routellm.abacus.ai/v1" }
].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
