export type Pair = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  partType?: FormPartType;
  fileName?: string;
};
export type BodyMode = "raw" | "form" | "none" | "multipart" | "binary" | "graphql";
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
export type ProxyMode = "none" | "system" | "environment" | "manual";
/** Proxy authentication negotiated by libcurl (manual) or forced scheme. */
export type ProxyAuthMode = "auto" | "basic" | "ntlm" | "negotiate";
export type ActivePanel = "request" | "settings" | "functions";

export type AppFunction = {
  id: string;
  name: string;
  /** Human-oriented summary shown in the function editor only. */
  description?: string;
  code: string;
  functionType: "http" | "javascript";
  method: string;
  url: string;
  queryParams: Pair[];
  headers: Pair[];
  bodyMode: BodyMode;
  rawType: RawType;
  body: string;
  form: Pair[];
  binaryFilePath?: string;
  graphqlVariables?: string;
  auth: RequestAuth;
  extractorCode: string;
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
  /** Read HTTP_PROXY/http_proxy when Environment variables mode is active. */
  useHttpProxyEnv: boolean;
  /** Read HTTPS_PROXY/https_proxy when Environment variables mode is active. */
  useHttpsProxyEnv: boolean;
  /** Read NO_PROXY/no_proxy when Environment variables mode is active. */
  useNoProxyEnv: boolean;
  /** Auto negotiates Basic / NTLM / SPNEGO on 407 for configured proxy sources. */
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
};

export type DuplicateNamingMode = "copyOf" | "numbered";

/** Ordered `[name, value]` pair — a list, not a map, so repeated header names
 * (e.g. two `Set-Cookie` headers) don't collapse into one. */
export type HeaderPair = [string, string];

export type SavedResponseHistoryItem = {
  id: string;
  title: string;
  timestamp: number;
  status: number;
  status_text: string;
  duration_ms: number;
  headers: HeaderPair[];
  body: string;
  /** True when `body` holds base64-encoded bytes (the response was not valid UTF-8 text). */
  body_is_base64: boolean;
  /** Real byte length of the response body, independent of `body`'s encoding. */
  body_size: number;
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
  binaryFilePath?: string;
  graphqlVariables?: string;
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
  headers: HeaderPair[];
  body: string;
  /** True when `body` holds base64-encoded bytes (the response was not valid UTF-8 text). */
  body_is_base64: boolean;
  /** Real byte length of the response body, independent of `body`'s encoding. */
  body_size: number;
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
      useHttpProxyEnv: true,
      useHttpsProxyEnv: true,
      useNoProxyEnv: true,
      authMode: "auto"
    },
    maximizeOnStartup: true,
    tabSize: 2,
    autoPrettifyJson: true,
    requestTimeoutSecs: 60,
    followRedirects: true,
    clickToSelect: true,
    duplicateNaming: "copyOf",
    proxyTestUrl: DEFAULT_PROXY_TEST_URL
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
