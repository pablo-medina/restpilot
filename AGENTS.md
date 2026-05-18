# RestPilot — Agent guidelines

## Language and copy

- All application **source code** (identifiers, comments, commit messages in this repo) must be written in **English**.
- The product supports **i18n** for user-visible strings. Supported locales:
  - **English** (`en`) — default, neutral formal tone
  - **Spanish** (`es`) — neutral formal tone (usted-style wording)
- Do not hardcode user-facing strings in components; add keys to `src/i18n/en.ts` and `src/i18n/es.ts`.

## Persistence

- All durable state is stored in **`config.json`** via Tauri commands (`load_app_config` / `save_app_config`).
- **Do not use `localStorage` or `sessionStorage`.**
- Do not add migration fallbacks from removed storage mechanisms.

### Clear all data

Settings → **Clear all data** must restore **factory defaults** for everything persisted and in-memory:

| What | Where to define defaults | Reset via |
|------|--------------------------|-----------|
| Collections, tabs, environments, globals | `defaultConfig()` in `src/types.ts` | `resetAppStateToDefaults()` in `src/app/reset-app-state.ts` |
| User preferences (`AppConfig.settings`) | `defaultSettings()` in `src/types.ts` | same (included in `defaultConfig()`) |
| Runtime UI only (`AppState` fields not in `AppConfig`) | `defaultRuntimeState()` in `src/app/reset-app-state.ts` | same |
| Settings panel session (proxy URL reveal, last test result) | `resetSettingsSessionState()` in `src/settings.ts` | called from `clearAllData` in `src/app.ts` |

**When adding new persisted settings:** extend `UserSettings`, set the value in `defaultSettings()`, and ensure `normalizeConfig()` applies it. Clear all data picks it up automatically through `defaultConfig()`.

**When adding new `AppState` fields** (search query, panel memory, etc.): add them to `AppState` in `src/app/state.ts`, set the initial value in `defaultRuntimeState()`, and verify `reset-app-state.test.ts` still passes.

## UI and theming

- Respect the existing visual language in `src/styles.css` (zen palette, glass rail, folder/request icons).
- Reuse existing patterns: full re-render in `main.ts`, string templates, CSS classes.
- New surfaces should support **light** (default) and **dark** themes via `[data-theme]` on `document.documentElement`.
- **Palette tokens** (`--rp-*` in `src/styles.css`): shared names for light and dark. Light values live on `:root`; dark remaps the same tokens inside `[data-theme="dark"]`. Prefer `var(--rp-surface)`, `var(--rp-border)`, etc. in new rules. Legacy `--dark-*` aliases still exist for older selectors.
- When adding sections, tabs, or panels: match existing spacing and typography. Reuse `.segmented` / `.tabs` patterns instead of inventing new tab markup. **Before finishing**, walk through [Flex and panel layout](#flex-and-panel-layout) below—most layout bugs come from skipping it.

### Flex and panel layout

RestPilot fills the window with nested flex/grid. New sections break easily if height, scroll, or visibility are on the wrong node. **Copy an existing panel** (`params` / `headers` / `auth` / `body`) instead of inventing structure.

#### Height chain (request workspace)

The viewport height must flow top → bottom. Every flex child that should grow needs `flex: 1` **and** `min-height: 0`. Every ancestor in the chain must allow shrinking (`min-height: 0`, `overflow: hidden` where appropriate).

```
#app.app-frame → .shell.shell--workspace-only → .workspace → .workspace-body
  → .request-editor → .editor-grid → .request-card / .response-card
    → .request-tab-panel (per tab: params, auth, body, …)
```

Reference: `src/styles.css` — `#app.app-frame`, `.shell.shell--workspace-only .workspace`, `.request-editor`, `.editor-grid`, `.request-card`, `.request-tab-panel`.

When adding a panel inside `.request-card`, it almost always mounts under **`.request-tab-panel`** (see `renderRequestTabPanel` in `src/app.ts`).

#### Panel insets (forms, lists, tab content)

Content must not touch the card edges. Use the shared tokens in `src/styles.css` (`:root`):

| Token | Default | Use |
|-------|---------|-----|
| `--panel-inset-inline` | `16px` | Request/response **card tab** content (`.request-tab-panel`) |
| `--panel-inset-block` | `12px` | Same, vertical padding |
| `--workspace-panel-inset-inline` | `22px` | Full-width workspace panels (Settings, Variables) |
| `--workspace-panel-inset-block` | `18px` | Same, vertical |

**Rules:**

- Put scrollable lists and forms **inside** `.request-tab-panel` so they inherit inset padding. Do **not** zero out horizontal padding on a modifier (e.g. `.request-auth-panel { padding: 4px 2px }`)—that was a real bug.
- Full-bleed UI inside a card (e.g. CodeMirror edge-to-edge) is the exception: wrap only the editor in a negated-margin container, not the whole tab.
- New workspace-level panels: `padding: var(--workspace-panel-inset-block) … var(--workspace-panel-inset-inline)` (see `.settings-view`).

#### Field remove control (×)

Use for deleting a row in params, headers, form, or closing a request tab when the control is the **×** character.

| Token / class | Purpose |
|---------------|---------|
| `mini-btn field-remove-btn` | Markup on the button |
| `--field-remove-size` (`28px`) | Hit target; reserve this width in `.pair-row` grid last column |
| `--field-remove-color` | Muted red (`#b54a3a`), `font-weight: 800`, `font-size: 17px` |
| `.request-tab .tab-close` | Same red ×, slightly smaller (`22px`) for tabs |

**Rules:**

- Always `aria-label` from i18n (e.g. `t().tree.delete`).
- Do **not** reuse `field-remove-btn` for `+` add buttons, tree SVG actions, or panel close—those stay default `.mini-btn` or `.danger` with icons.
- New repeatable rows: last grid column = `var(--field-remove-size)`.

#### Rules (read every time)

| Goal | Do | Do not |
|------|----|--------|
| Panel fills remaining height below URL / card tabs | `flex: 1; min-height: 0` on the tab panel; `overflow-y: auto` on the **scrolling** child | `height: 100%` alone without `min-height: 0` on parents; scroll on `.request-card` |
| Tab bars, toolbars, URL line stay fixed height | `flex-shrink: 0` on `.tabs`, `.request-line`, `.body-toolbar`, `.request-tab-toolbar` | Let toolbars shrink or grow with leftover space |
| Short forms (auth, settings rows) stay **top-aligned** | On a `flex: 1` panel using **grid**: `align-content: start; align-items: start` (see `.request-tab-panel.request-auth-panel`) | Default grid/flex stretch—fields spread vertically with huge gaps |
| Settings label + checkbox/toggle on one row | `.settings-toggle-row`: `inline-grid` + `grid-template-columns: auto auto` + `width: fit-content`. Parent rows (e.g. `.settings-network-general`) use `flex-wrap`, not `1fr` beside the control | `grid-template-columns: 1fr auto` on toggles, or a parent column `1fr` that stretches the label away from the checkbox |
| Settings proxy URL / secret fields | `.settings-input-shell` + `.settings-input-trailing` (× then 👁 inside the input, right-aligned). Copy from `src/settings.ts` | External grid columns for × / 👁 beside the input |
| Long lists (params, headers) | Wrapper with `flex: 1; min-height: 0; overflow: auto` (`.request-pairs-list`) | List without `min-height: 0`—parent won't scroll |
| Two columns (request / response) | `.editor-grid` with `grid-template-rows: minmax(0, 1fr)` and cards `height: 100%` | Row height `auto` only—cards stay minimum height |
| Hide one of several variants | `is-hidden` class + `display: none` in CSS; helpers in `src/ui/visibility.ts` | HTML `hidden` attribute alone (overridden by `display: grid`/`flex`); `visibility: hidden` when space must collapse |

#### Conditional sections (mutually exclusive blocks)

- Markup: `class="block${hiddenClass(!visible)}"` — import `hiddenClass` / `setVisible` from `src/ui/visibility.ts`.
- CSS: scoped rule, e.g. `.my-panel .my-block.is-hidden { display: none; }`.
- Runtime: `element.classList.toggle("is-hidden", !visible)` (same as `setVisible(el, visible)`).
- Example: `src/request-auth-panel.ts` + `.request-auth-panel .auth-fields.is-hidden`.

#### Checklist for a new request-card tab panel

1. Render inside `<div class="request-tab-panel …">` (or reuse that class).
2. If content is a **short form**: grid or flex column + `align-content: start` on the panel; `overflow-y: auto` only if content can exceed viewport.
3. If content is a **long list**: outer `request-tab-panel` with `flex: 1; min-height: 0`; inner list `flex: 1; min-height: 0; overflow: auto`.
4. Toolbars above the list: `flex-shrink: 0`.
5. If switching sub-variants: `is-hidden` + `display: none`, not `hidden` attribute.
6. Resize the window in the app: no empty band below cards; no stretched labels/inputs; scroll appears on the list/editor, not the whole window.
7. Fields and labels are inset from the card border (`--panel-inset-inline`); nothing flush against the vertical divider.
8. Row delete uses `mini-btn field-remove-btn` with × (see **Field remove control**).

#### Symptoms → usual cause

- **Huge vertical gaps** between a few fields → `flex: 1` grid/flex panel without `align-content: start`.
- **Panel stuck at minimum height** with empty space below cards → missing `flex: 1` / `min-height: 0` in the chain, or `.editor-grid` rows still `auto`.
- **All variants visible at once** → `hidden` attribute without `.is-hidden { display: none }`.
- **Can't scroll** → `overflow` on wrong element, or missing `min-height: 0` on flex child.
- Dialogs:
  - `messageDialog` — kinds: `information`, `confirmation`, `warning`, `error` (fixed size)
  - `applicationDialog` — draggable; resizable when `resizable: true`; maximize/restore only when resizable
- Popovers (compact overlays anchored to toolbar controls):
  - Build markup with `renderPopoverShell()` in `src/components/popover.ts`
  - Every popover **must** include the top-right close button (`data-popover-close`); do not rely on outside click alone
  - Mount on `document.body`, close on Escape and via `closeRequestPopovers()` when leaving the request workspace

## Settings

- User preferences live in `AppConfig.settings` (theme, language, proxy).
- Proxy modes: `none`, `system`, `manual`. Default: `none`.

### Proxy (user settings)

Settings UI: `src/settings.ts`. Persisted in `AppConfig.settings.proxy` via `proxyPayload()` in `src/app/persistence.ts`. Normalized in `normalizeProxySettings()` (`src/app/proxy-settings.ts`).

| Field | Meaning |
|-------|---------|
| `mode` | `none` — direct connection. `system` — OS/PAC (Windows: WinHTTP). `manual` — full proxy URLs below. |
| `httpProxy` / `httpsProxy` | Full URL, e.g. `http://user:pass@proxy.example.com:8080`. Manual mode only. For HTTPS targets, HTTPS proxy alone is enough. |
| `noProxy` | Comma-separated hosts bypassing the proxy (e.g. `localhost,127.0.0.1`). Merged with process `NO_PROXY` when set. |
| `authMode` | `auto` (default), `basic`, `ntlm`, `negotiate`. Preset to `auto` when switching to system or manual. |
| `proxyTestUrl` | URL used by the Settings **Test** button (same stack as real requests). Test output is a step log dialog (redacted). |

**Do not change proxy/HTTP connection behavior** (`src-tauri` HTTP stack, `curl` dependency, `.cargo/config.toml` NTLM flags) **without explicit user confirmation.** Documentation-only updates are fine.

### Proxy (runtime behavior)

**Engine selection** (`src-tauri/src/http_curl.rs`, `should_use_curl`):

| Situation | Engine |
|-----------|--------|
| `mode === "none"` | reqwest, no proxy |
| `mode === "manual"` + `authMode === "basic"` | reqwest + Basic proxy auth |
| `mode === "manual"` + `authMode` auto / ntlm / negotiate | **libcurl** (blocking thread) |
| `mode === "system"` + `authMode !== "basic"` | **libcurl** + PAC / `HTTP_PROXY` / `HTTPS_PROXY` |
| `mode === "system"` + `authMode === "basic"` | reqwest + resolved system/PAC proxy |

**Corporate gateways (407 + NTLM on CONNECT):** Many proxies answer the first `CONNECT` with `407` and `Proxy-Authenticate: NTLM`, then expect a **three-step** NTLM handshake on the tunnel before `200 Connection Established`. libcurl handles that when NTLM is enabled in the build.

- **`authMode: auto`** — proxy auth is **NTLM only** (no Negotiate in auto; avoids SPNEGO token errors on domain proxies).
- **`authMode: ntlm` / `negotiate`** — force that scheme via libcurl.
- **`authMode: basic`** — reqwest only; fails on NTLM-only proxies.

**Credentials:**

- Parsed from the proxy URL (`src-tauri/src/proxy_uri.rs`): user, password, host, port. Password special characters (e.g. `$`) must survive URL encoding/decoding.
- For NTLM (non-basic), username sent to libcurl as `DOMAIN\user`:
  - Already `DOMAIN\user` or `user@DOMAIN` in the URL → kept/mapped.
  - Otherwise on Windows → `USERDOMAIN\user` from the environment.
- Do not log or document real customer hostnames, domains, or usernames in UI copy, examples, or tests. Use `proxy.example.com`, `CORP`, `alice`.

**Build (libcurl + NTLM):**

- Dependency: `curl` with `static-curl`, `ssl`, `ntlm` (`src-tauri/Cargo.toml`).
- **Required:** `CURL_ENABLE_NTLM` when compiling vendored libcurl. The `curl-sys` `ntlm` feature compiles sources but omits this define unless set — without it, runtime error `[4]` (“feature not built-in”) and `Version::feature_ntlm() === false`.
- Project fix: `.cargo/config.toml` sets `CFLAGS = "-DCURL_ENABLE_NTLM"`.
- Guard: unit test `curl_build_tests::libcurl_includes_ntlm` in `src-tauri/src/lib.rs`; `ensure_curl_ntlm()` before curl proxy requests.

**Diagnostics (Settings → Test):** `test_proxy_connection` uses the same path as `send_request`. Detail line may include mode, auth mode, `HTTP engine: libcurl`, redacted proxy URLs, TCP reachability — no domain\user principal line (avoid leaking AD names).

**Platform notes:**

- **Windows:** vendored libcurl + Schannel/SSPI; NTLM via `ntlm_sspi.c`. System PAC: `proxy_windows.rs` (WinHTTP).
- **Linux / macOS:** vendored libcurl + OpenSSL; NTLM with explicit credentials in URL. Negotiate may need OS Kerberos; less common than on Windows AD proxies.

## HTTP

- Requests are sent through Tauri/Rust (`send_request`). Pass `proxy` from frontend settings (`proxyPayload` in `src/app/persistence.ts`).
- Proxy test and sends share libcurl vs reqwest rules above.

## Collection tree

- Collection order is a flat `items[]` with `parentId`. Drag-and-drop must support reordering, nesting folders, moving requests between folders, and moving items to the root.

## AI assistant

OpenAI-compatible chat panel (activity bar → **AI** when `settings.ai.enabled`). Settings live under **Settings → AI** tab (`src/settings-ai.ts`). Chat UI: `src/ai-workspace.ts`. Orchestration: `src/ai/chat-controller.ts`.

- **Persistence:** `AppConfig.settings.ai` (URL, API key, model, `toolPolicy`, `instructions`). Chat history is **runtime only** (`state.aiChat` in `src/app/state.ts`); not saved to `config.json`.
- **Custom instructions:** `settings.ai.instructions` (Settings → AI textarea) is appended to the system prompt in `buildAiSystemPrompt()` (`src/ai/context.ts`) under “User-defined instructions”. Max length: `MAX_AI_INSTRUCTIONS_CHARS` in `src/app/ai-settings.ts`.
- **Collection mutations from tools:** `create_request_draft` updates `state.items` and calls `notifyCollectionChanged()` (`src/app/collection-mutation.ts`) so the explorer tree refreshes and config saves. The AI panel shows the collection sidebar (same as request workspace) so new items are visible without leaving the chat.
- **HTTP:** Same stack as real requests (`ai_chat_stream` / `list_ai_models` / `test_ai_connection` in `src-tauri/src/ai_openai.rs`), including proxy and network timeouts via `httpTransportPayload()`.
- **System prompt:** Built in `src/ai/context.ts` (`buildAiSystemPrompt`). Includes **current local date/time** (refreshed each message via `formatCurrentDateTimeForAi`), collection catalog, variable names, and function list for reference. Instructs the model to answer in the app locale, when to call tools, and conversation continuity (ordinals, `get_request` for body questions, etc.).
- **Tools on the wire:** All tool definitions are sent with `tool_choice: "auto"` (`chat-controller.ts`). The model decides whether to call tools; there is no separate client-side “tool gating” layer.

### AI behavior fixes (for agents)

When the user reports weak or confused AI chat behavior (wrong tool use, ignored lists, bad JSON bodies, etc.):

- **Default fix: prompt engineering** — improve `buildAiSystemPrompt()` in `src/ai/context.ts` and/or tool descriptions in `src/ai/tools.ts` (`AI_TOOL_DEFINITIONS`). Keep system prompt text in **English**; user-facing chat still follows app locale via existing instructions.
- **Do not add** client-side “preflight” layers, keyword/regex routers, or locale-specific intent detectors (e.g. matching ordinals or body-inspect phrases per language) to substitute for the model. They do not scale (every new locale needs more patches) and were explicitly rejected.
- **Do not add** i18n strings whose only purpose is to drive those routers.
- **Acceptable code** when it is not a substitute for prompts: deterministic normalization of data the model already produced (e.g. `src/json-request-body.ts` repairing invalid JSON bodies on tool write), UI affordances, or real bugs in tool execution / persistence.
- **If a non-prompt code change seems necessary**, describe it briefly and **ask the user to validate** before implementing — especially anything that intercepts user messages before the LLM or bypasses tool calling.

### AI tools (function calling)

Definitions and execution: `src/ai/tools.ts`. Runner for HTTP side effects: `src/ai/request-runner.ts`.

| Tool | Read/write | What it does |
|------|------------|--------------|
| `list_requests` | Read | Returns JSON of all folders and saved requests (`id`, title, method, url, parent). |
| `get_request` | Read | Returns full saved request by `request_id`. Auth secrets are **redacted** (`redactRequestAuthForExport`). |
| `send_request` | HTTP + read | Executes a saved request by `request_id` (variables, proxy, real `send_request`). Returns status, headers, truncated body (~12k chars). |
| `run_function` | HTTP + write | Runs a RestPilot **Function** by `function_id` (HTTP + variable extractor). May update environments. |
| `create_request_draft` | Write | Creates a new saved request (`title`, `method`, `url`, optional `parent_id` folder). Persists via `scheduleSave()`. |

**Parameters (OpenAI function schema):**

- `list_requests` — none.
- `get_request` — `request_id` (string, required).
- `send_request` — `request_id` (string, required).
- `run_function` — `function_id` (string, required).
- `create_request_draft` — `title`, `method`, `url` (required); `parent_id` (string or null, optional).

**Tool policy** (`settings.ai.toolPolicy`, Settings → AI behavior):

| Policy | Behavior |
|--------|----------|
| `confirm_all` | Confirm before every tool (default). |
| `read_only_auto` | Auto-run `list_requests` and `get_request` only; confirm HTTP and writes. |
| `auto_all` | Run all tools without confirmation. |

Read-only tools: `list_requests`, `get_request` (`isReadOnlyAiTool()` in `tools.ts`). Confirmation UI: `applicationDialog` in `chat-controller.ts` (`confirmToolCalls`).

**Multi-round flow:** Up to 5 tool rounds per user message (`MAX_TOOL_ROUNDS` in `chat-controller.ts`). Assistant `tool_calls` are stored as JSON in message content for API rebuild; tool results use role `tool` with `tool_call_id`.

**When changing tools:** Update `AI_TOOL_DEFINITIONS`, `executeAiTool()`, `describeAiToolCall()`, system prompt in `context.ts`, and relevant tests under `src/ai/`.

## Startup and performance

- **Release builds** are the benchmark for startup UX: the static shell in `index.html` paints immediately; `src/bootstrap.ts` applies theme/locale and loads config while `src/app.ts` is fetched as a separate chunk. CodeMirror loads only via `src/app/editor-runtime.ts` when editors mount.
- **`tauri dev` is expected to feel much slower** (unbundled modules, HMR, no minification). Do not treat dev startup time as a regression if release/`tauri build` feels instant — that is the target for the shipped app.
- If the user reports a blank screen for several seconds, verify **release** first before chasing dev-only slowness.

## Source layout

- `src/bootstrap.ts` — minimal entry: startup prefs, parallel config load, dynamic `import("./app")`.
- `src/app.ts` — UI orchestration (render, bindings, panels). Still large; further splits belong in `src/ui/` when touched.
- `src/main.ts` — re-exports `bootstrap` (Vite entry compatibility).
- `src/app/state.ts` — shared `state`, IDs, collection lookups, formatting helpers.
- `src/app/persistence.ts` — config load/normalize/save (`scheduleSave`, `persistConfig`).
- `src/app/collection-store.ts` — tree reorder inserts/moves (calls `render()` via `app/render.ts`).
- `src/app/request-utils.ts` — blank request factory, content-type, form payload for HTTP.
- `src/app/render.ts` — `render()` dispatcher so non-UI modules can request a re-render without importing `main.ts`.
- `src/curl.ts`, `src/url-params.ts`, `src/variables.ts`, `src/content-display.ts` — pure helpers covered by unit tests.
- `src/ai-workspace.ts`, `src/ai/` — AI panel, chat controller, tools, context, actions/markdown rendering.
- `src/settings-ai.ts` — AI section in Settings (model picker, presets, test connection).

## Tests

- Run locally: `npm test` (Vitest). No GitHub Actions workflow is configured; do not add push-triggered CI unless explicitly requested.
