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
export type RequestTab = "queryParams" | "auth" | "headers" | "body";

export type RequestAuthType = "none" | "bearer" | "basic" | "apikey";

/** How Basic auth credentials are entered: separate fields, or a pre-encoded base64 token. */
export type BasicAuthMode = "credentials" | "token";

export type RequestAuth = {
  type: RequestAuthType;
  bearerToken?: string;
  basicMode?: BasicAuthMode;
  basicUsername?: string;
  basicPassword?: string;
  /** Base64 `user:password` used verbatim when `basicMode === "token"`. */
  basicToken?: string;
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
export type ActivePanel = "request" | "settings";

export const DEFAULT_PROXY_TEST_URL = "https://jsonplaceholder.typicode.com/posts/1";

/** Open-tab cap applied when the limit is switched on. */
export const DEFAULT_MAX_OPEN_TABS = 5;
export const MIN_MAX_OPEN_TABS = 1;
export const MAX_MAX_OPEN_TABS = 50;

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
  /** Cap how many request tabs stay open; the least recently used leave the strip when a
   * new one opens. The request itself is never deleted. */
  limitOpenTabs: boolean;
  /** Tabs kept open while `limitOpenTabs` is on (1-50). */
  maxOpenTabs: number;
  /** How duplicated folder and request titles are named. */
  duplicateNaming: DuplicateNamingMode;
  /** Last URL used in Settings → network proxy test. */
  proxyTestUrl: string;
};

export type DuplicateNamingMode = "copyOf" | "numbered";

export type VariableScope = "global" | "environment";

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
  /** Runs an extractor over the response. Absent when the request does not use one. */
  extractor?: RequestExtractor;
  lastResponse: ApiResponse | null;
  lastError: string | null;
  savedResponses?: SavedResponseHistoryItem[];
};

/** Answers to a request's run-time parameters, keyed by parameter name. */
export type ParameterAnswers = Record<string, string>;

/** A named script that pulls a value out of a response body. */
export type Extractor = {
  id: string;
  name: string;
  description?: string;
  code: string;
  /** Response body the editor's Test button runs against. */
  sampleText: string;
};

/** Present only when an extractor is assigned; choosing one is what enables the feature. */
export type RequestExtractor = {
  extractorId: string;
  /** Variable that receives the value; blank shows the result in a dialog instead. */
  variable?: string;
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

/** Schema version of `config.json`. Bumped when stored data needs a one-time rewrite;
 * `normalizeConfig()` upgrades anything older on load. Version 2 switched the template
 * syntax from `${name}` to `{{name}}`. */
export const CONFIG_VERSION = 2;

/** Version assumed for configs written before `configVersion` existed. */
export const LEGACY_CONFIG_VERSION = 1;

export type AppConfig = {
  /** See `CONFIG_VERSION`. Missing in configs written before versioning existed. */
  configVersion: number;
  items: TreeItem[];
  variables: Variable[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  openTabs: string[];
  activeTabId: string;
  settings: UserSettings;
  extractors: Extractor[];
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
    limitOpenTabs: false,
    maxOpenTabs: DEFAULT_MAX_OPEN_TABS,
    duplicateNaming: "copyOf",
    proxyTestUrl: DEFAULT_PROXY_TEST_URL
  };
}

export function clampRequestTimeoutSecs(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return defaultSettings().requestTimeoutSecs;
  return Math.max(5, Math.min(300, Math.round(parsed)));
}

export function clampMaxOpenTabs(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_OPEN_TABS;
  return Math.max(MIN_MAX_OPEN_TABS, Math.min(MAX_MAX_OPEN_TABS, Math.round(parsed)));
}

export function clampTabSize(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(8, Math.round(parsed)));
}

export function defaultConfig(): AppConfig {
  return {
    configVersion: CONFIG_VERSION,
    items: [],
    variables: [],
    environments: [],
    activeEnvironmentId: null,
    openTabs: [],
    activeTabId: "",
    settings: defaultSettings(),
    extractors: []
  };
}
