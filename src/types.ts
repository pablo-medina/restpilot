export type Pair = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  partType?: FormPartType;
  fileName?: string;
};
export type BodyMode = "raw" | "form" | "none" | "multipart";
export type FormPartType = "text" | "file";
export type RawType = "json" | "text" | "xml";
export type ResponseTab = "body" | "headers";
export type RequestTab = "params" | "auth" | "headers" | "body";

export type RequestAuthType = "none" | "bearer" | "basic" | "apikey";

export type RequestAuth = {
  type: RequestAuthType;
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyIn?: "header" | "query";
};
export type DialogKind = "information" | "confirmation" | "warning" | "error";
export type ThemeMode = "light" | "dark";
export type Locale = "en" | "es";
export type ProxyMode = "none" | "system" | "manual";
/** Proxy authentication negotiated by libcurl (manual) or forced scheme. */
export type ProxyAuthMode = "auto" | "basic" | "ntlm" | "negotiate";
export type ActivePanel = "request" | "variables" | "ai" | "settings" | "functions";

export type AiToolPolicy = "confirm_all" | "read_only_auto" | "auto_all";

export type AiSettings = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  toolPolicy: AiToolPolicy;
  /** Appended to the AI system prompt when non-empty. */
  instructions: string;
};

export type AiChatRole = "user" | "assistant" | "system" | "tool";

export type AiChatActionKind = "open_request" | "open_function";

export type AiChatAction = {
  id: string;
  kind: AiChatActionKind;
  targetId: string;
  label: string;
};

export type AiChatMessage = {
  id: string;
  role: AiChatRole;
  content: string;
  thinking?: string;
  thinkingExpanded?: boolean;
  toolName?: string;
  toolCallId?: string;
  pending?: boolean;
  actions?: AiChatAction[];
};

export type AiChatRuntimeState = {
  messages: AiChatMessage[];
  streaming: boolean;
  streamRunId: string | null;
  pendingToolCalls: AiPendingToolCall[] | null;
};

export type AiPendingToolCall = {
  id: string;
  name: string;
  argumentsJson: string;
};

export type AiStreamPayload = {
  chat_id: string;
  delta?: string | null;
  thinking?: string | null;
  done: boolean;
  error?: string | null;
  tool_calls?: AiStreamToolCall[] | null;
};

export type AiStreamToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AppFunction = {
  id: string;
  name: string;
  /** Human-oriented summary for the user and AI; shown in the function editor only. */
  description?: string;
  code: string;
  functionType: "http" | "ai" | "javascript";
  method: string;
  url: string;
  queryParams: Pair[];
  headers: Pair[];
  bodyMode: BodyMode;
  rawType: RawType;
  body: string;
  form: Pair[];
  auth: RequestAuth;
  extractorType?: "javascript" | "ai";
  extractorCode: string;
  extractorPrompt?: string;
  aiRequestPrompt?: string;
  /** Last HTTP response from Send in the function workspace (not updated by extractor run). */
  lastHttpResponse?: ApiResponse | null;
  /** Last extractor script outcome (not updated by Send alone). */
  lastTestResult?: {
    success: boolean;
    extractedValue?: unknown;
    error?: string;
  } | null;
};


export const DEFAULT_PROXY_TEST_URL = "https://jsonplaceholder.typicode.com/posts/1";

export type ProxySettings = {
  mode: ProxyMode;
  /** Full proxy URL for HTTP requests (e.g. http://user:pass@proxy:8080). */
  httpProxy: string;
  /** Full proxy URL for HTTPS requests (e.g. https://user:pass@proxy:8080). */
  httpsProxy: string;
  /** Comma-separated hosts that bypass the proxy (e.g. localhost,127.0.0.1). */
  noProxy: string;
  /** Auto negotiates Basic / NTLM / SPNEGO on 407 (libcurl for manual and system). */
  authMode: ProxyAuthMode;
};

export type UserSettings = {
  theme: ThemeMode;
  language: Locale;
  proxy: ProxySettings;
  maximizeOnStartup: boolean;
  /** Spaces inserted when pressing Tab in the request body editor (1–8). */
  tabSize: number;
  /** Format JSON in the request body when pasting or importing cURL (if valid). */
  autoPrettifyJson: boolean;
  /** Per-request timeout in seconds (non-streaming). Streaming uses at least 600 s. */
  requestTimeoutSecs: number;
  /** Whether the HTTP client follows redirects (up to 10 hops). */
  followRedirects: boolean;
  /** Single-click a request with an open tab focuses that tab; does not open closed requests. */
  clickToSelect: boolean;
  /** How duplicated folder and request titles are named. */
  duplicateNaming: DuplicateNamingMode;
  /** Last URL used in Settings → network proxy test. */
  proxyTestUrl: string;
  ai: AiSettings;
};

export type DuplicateNamingMode = "copyOf" | "numbered";

export type SavedResponseHistoryItem = {
  id: string;
  title: string;
  timestamp: number;
  status: number;
  status_text: string;
  duration_ms: number;
  headers: Record<string, string>;
  body: string;
};

export type SavedRequest = {
  id: string;
  kind: "request";
  /** Folder id, or `/` for collection root. */
  parentId: string;
  title: string;
  /** Human-oriented summary; tree shows as tooltip only. */
  description?: string;
  method: string;
  url: string;
  /** Fragment without leading # (synced with the URL field). */
  urlHash?: string;
  queryParams: Pair[];
  headers: Pair[];
  bodyMode: BodyMode;
  rawType: RawType;
  body: string;
  form: Pair[];
  streamResponse: boolean;
  auth: RequestAuth;
  lastResponse: ApiResponse | null;
  lastError: string | null;
  savedResponses?: SavedResponseHistoryItem[];
};

export type Folder = {
  id: string;
  kind: "folder";
  /** Folder id, or `/` ({@link COLLECTION_ROOT_PARENT_ID}) for collection root. */
  parentId: string;
  title: string;
  expanded: boolean;
};

export type TreeItem = SavedRequest | Folder;
export type Variable = { id: string; name: string; value: string; enabled: boolean; secret?: boolean };

export type Environment = {
  id: string;
  name: string;
  variables: Variable[];
};

export type ApiResponse = {
  status: number;
  status_text: string;
  duration_ms: number;
  headers: Record<string, string>;
  body: string;
};

export type TabState = {
  requestId: string;
  response: ApiResponse | null;
  error: string | null;
  loading: boolean;
  streaming: boolean;
  requestRunId: string | null;
  selectedResponseTab: ResponseTab;
  selectedRequestTab: RequestTab;
  displayUnmount?: () => void;
  bodyEditorUnmount?: () => void;
  responseBodyUnmount?: () => void;
  headersTableUnmount?: () => void;
  bodyLinesKey?: string;
  bodyLineOffsets?: number[];
  bodyLineScanLength?: number;
  responseDisplayKey?: string;
  responseDisplayBody?: string;
  selectedSavedResponseId?: string | null;
};

export type CollectionSnapshot = {
  items: TreeItem[];
  variables: Variable[];
  environments: Environment[];
  activeEnvironmentId: string | null;
};

export type AppConfig = {
  items: TreeItem[];
  variables: Variable[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  openTabs: string[];
  activeTabId: string;
  settings: UserSettings;
  functions: AppFunction[];
  activeFunctionId: string | null;
};


export function defaultSettings(): UserSettings {
  return {
    theme: "light",
    language: "en",
    proxy: {
      mode: "none",
      httpProxy: "",
      httpsProxy: "",
      noProxy: "localhost,127.0.0.1",
      authMode: "auto"
    },
    maximizeOnStartup: true,
    tabSize: 2,
    autoPrettifyJson: true,
    requestTimeoutSecs: 60,
    followRedirects: true,
    clickToSelect: true,
    duplicateNaming: "copyOf",
    proxyTestUrl: DEFAULT_PROXY_TEST_URL,
    ai: {
      enabled: false,
      baseUrl: "http://127.0.0.1:1234/v1",
      apiKey: "",
      model: "",
      toolPolicy: "confirm_all",
      instructions: ""
    }
  };
}

export function clampRequestTimeoutSecs(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return defaultSettings().requestTimeoutSecs;
  return Math.max(5, Math.min(300, Math.round(parsed)));
}

export function clampTabSize(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(8, Math.round(parsed)));
}

export function defaultConfig(): AppConfig {
  return {
    items: [],
    variables: [],
    environments: [],
    activeEnvironmentId: null,
    openTabs: [],
    activeTabId: "",
    settings: defaultSettings(),
    functions: [],
    activeFunctionId: null
  };
}

