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
export type RequestTab = "params" | "headers" | "body";
export type DialogKind = "information" | "confirmation" | "warning" | "error";
export type ThemeMode = "light" | "dark";
export type Locale = "en" | "es";
export type ProxyMode = "none" | "system" | "manual";
export type ActivePanel = "request" | "variables" | "settings";

export type ProxySettings = {
  mode: ProxyMode;
  host: string;
  port: number;
  username: string;
  password: string;
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
};

export type SavedRequest = {
  id: string;
  kind: "request";
  parentId: string | null;
  title: string;
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
  lastResponse: ApiResponse | null;
  lastError: string | null;
};

export type Folder = {
  id: string;
  kind: "folder";
  parentId: string | null;
  title: string;
  expanded: boolean;
};

export type TreeItem = SavedRequest | Folder;
export type Variable = { id: string; name: string; value: string; enabled: boolean };

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
};

export type AppConfig = {
  items: TreeItem[];
  variables: Variable[];
  openTabs: string[];
  activeTabId: string;
  settings: UserSettings;
};

export function defaultSettings(): UserSettings {
  return {
    theme: "light",
    language: "en",
    proxy: { mode: "none", host: "", port: 8080, username: "", password: "" },
    maximizeOnStartup: true,
    tabSize: 2,
    autoPrettifyJson: true,
    requestTimeoutSecs: 60,
    followRedirects: true
  };
}

export function clampRequestTimeoutSecs(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return defaultSettings().requestTimeoutSecs;
  return Math.max(5, Math.min(300, Math.round(parsed)));
}

export function defaultConfig(): AppConfig {
  return {
    items: [],
    variables: [],
    openTabs: [],
    activeTabId: "",
    settings: defaultSettings()
  };
}
