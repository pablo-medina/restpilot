export type Pair = { id: string; key: string; value: string; enabled: boolean };
export type BodyMode = "raw" | "form" | "node";
export type RawType = "json" | "text";
export type ResponseTab = "body" | "headers";
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
};

export type SavedRequest = {
  id: string;
  kind: "request";
  parentId: string | null;
  title: string;
  method: string;
  url: string;
  headers: Pair[];
  bodyMode: BodyMode;
  rawType: RawType;
  body: string;
  form: Pair[];
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
  requestRunId: string | null;
  selectedResponseTab: ResponseTab;
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
    proxy: { mode: "none", host: "", port: 8080, username: "", password: "" }
  };
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
