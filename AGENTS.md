# RestPilot — Agent guidelines

## Language and copy

- All application **source code** (identifiers, comments, commit messages in this repo) must be written in **English**.
- The product supports **i18n** for user-visible strings. Supported locales:
  - **English** (`en`) — default, neutral formal tone
  - **Spanish** (`es`) — neutral formal tone (usted-style wording)
- Do not hardcode user-facing strings in components; add keys to `src/i18n/en.ts` and `src/i18n/es.ts`.

## Persistence

- All durable state is stored in **`config.json`** via Tauri commands (`load_app_config` / `save_app_config`).
- **Response history** (`SavedRequest.lastResponse` / `lastError` / `savedResponses`) lives in a **separate file**, `responses.json`, next to `config.json` (Tauri commands `load_response_cache` / `save_response_cache`). This keeps large saved response bodies out of the settings file that gets rewritten on every collection edit. `src/app/persistence.ts`: `persistConfig()` strips those fields before calling `save_app_config` and writes them via `buildResponseCache()`/`save_response_cache`; `loadStoredConfig()` merges `load_response_cache()` back onto the normalized items by request id. Old configs that still embed response data inline are merged in and migrated to the split layout on the next save.
- **Do not use `localStorage` or `sessionStorage`.**
- Do not add migration fallbacks from removed storage mechanisms.

### Config version and schema upgrades

`AppConfig.configVersion` (`CONFIG_VERSION` in `src/types.ts`) is the schema version of `config.json`. When stored data needs a one-time rewrite, bump it and add the upgrade to `normalizeConfig()` in `src/app/config-normalize.ts`, which runs on load **and** on RestPilot collection import (export files embed raw items and carry no version of their own, so `parseCollectionExport()` passes `LEGACY_CONFIG_VERSION`).

**Upgrades run after normalization**, so every field is already the right shape — including fields normalization derives, like the `auth` block hoisted out of an `Authorization` header. Write each upgrade to be **idempotent**: the import path re-runs it on already-current data.

Keep an upgrade in its own module so it can be deleted wholesale once no config in the wild predates it (see `src/app/migrate-variable-syntax.ts`). This is not the same thing as a runtime compatibility layer, which is still forbidden — the app understands exactly one shape at a time.

### Variable templates

The template syntax is **`{{name}}`**, matching Postman and Insomnia (which is why the import/export paths carry templates through verbatim). The pattern is defined once in `src/lib/variables.ts`; use `hasVariableTemplate()` and `collectTemplateNames()` instead of writing the regex again.

`applyVariables()` does **not** resolve nested references — a `{{x}}` inside a variable's *value* is literal text (ROADMAP 3.8). It is also never applied to `extractorCode`, which is JavaScript where `${}` is a real template literal.

A `{{…}}` is one of two things, and `classifyTemplate()` is what tells them apart:

| Written | Means | Resolved from |
|---------|-------|---------------|
| `{{name}}` | stored variable | globals, overridden by the active environment |
| `{{?name}}` | run-time parameter | the answers given when the request runs |

`replaceTemplates()` is the single walker over both. It makes **one pass**, so whatever a reference resolves to is final — an answer or variable value containing `{{…}}` is substituted verbatim, never expanded again. Anything that needs to scan a request's templated fields should walk `requestTemplateFields()` rather than rebuilding the field list, so a newly templated field is picked up everywhere at once.

**A template is opaque to URL syntax.** `src/lib/url-params.ts` masks every `{{…}}` behind an unreserved placeholder before parsing or encoding, then restores it — the same thing Postman and Insomnia do with their tokens. Without it the `?` in `{{?name}}` starts a query string and `URLSearchParams` turns the braces into `%7B%7D`. `TEMPLATE_TOKEN` deliberately also matches an **unterminated** trailing template (`{{?num`, `{{?num}`), because typing happens one character at a time. `buildRequestUrl(…, preserveTemplates)` is `true` only for the URL being edited (`displayRequestUrl`); the outbound URL leaves it off so a resolved value containing braces is still encoded.

**The URL field is not re-derived while it has focus.** `UrlField` in `RequestEditor.tsx` holds the typed text in a draft and only falls back to the composed URL on blur. A fully controlled field that re-renders from the parsed parts rewrites the text mid-keystroke — masking alone does not save it, because a half-typed template is not yet a template.

### Run-time parameters

A `{{?name}}` is a value the request asks for when it runs. There is nothing to declare or configure: `requestParameterNames()` (`src/lib/parameters.ts`) infers them from the request text on every send, and all values are plain strings.

`trySendRequest()` calls `promptForParameters()` before anything goes on the wire; `null` means cancelled and the run is abandoned. Answers then ride an optional trailing `answers` argument through `resolvedOutboundUrl` / `buildOutboundHeaders` / `buildRequestHeaders` / `buildFormPayload` down to `applyVariables`. All default to `{}`, so cURL generation, previews and export keep working and render parameters as empty.

`ParameterPromptDialog` shows one input for a single parameter and a spreadsheet grid for several (Enter/↓ step forward, ↑ steps back, Enter past the last row sends). It seeds each value from the last answer for that request, else a variable of the same name. Last answers live in a module-level map — runtime only, never in config.json.

### Dialogs — use `AppModal`, do not hand-roll one

**Never build a modal out of a bare `.app-dialog` + `.dialog-title`.** Every hand-rolled one shipped the same three defects: a title bar that looks draggable but is not, a bare `×` glyph instead of the real close control, and its own broken centring. `AppModal` (`src/react/components/dialogs/AppModal.tsx`) is the shell — pass `title`, `variant`, `width`, optional `height`, `onClose` and an optional `footer`, and it provides:

- a **working drag** on the title bar (`cursor: grab`, clamped so a grab strip always stays on screen),
- the standard close button (`iconWindowClose` in `.dialog-window-btn--close`),
- Escape to close, and centring via explicit `left`/`top`.

Centring uses `left`/`top`, **not** `transform`: `.app-dialog` carries `animation: rp-dialog-appear … !important`, and its final frame `transform: scale(1)` silently overwrites any `transform: translate(-50%, -50%)`.

`AppDialog` is a different thing — it renders the imperative `applicationDialog()` stack from `components/dialogs.ts`. React-owned modals use `AppModal`.

### Lists and options — reset the button

A `<button>` used as a list row or a dropdown option inherits the UA's `text-align: center` **and** `align-items: center`. Centred option labels have been a repeat complaint. Every such rule needs:

```css
padding: 0; border: 0; background: transparent;
color: inherit; font: inherit;
align-items: stretch; text-align: left; cursor: pointer;
```

`.rp-dropdown-option`, `.extractors-dialog-list-item` and `.extractors-popover-item-main` all carry it.

**A dropdown list is sized to its content, not to its trigger** — `width: max-content; min-width: 100%; max-width: min(420px, calc(100vw - 32px))`. Tying the list to the trigger's width leaves descriptions unreadable in a 120px control.

### Rows that toggle

A control row must not change height when its state changes, or everything below it jumps. Give the row a fixed height and keep the same controls mounted, disabling rather than unmounting them (see `.extractor-bar`). And do not add a checkbox whose only job is to reveal the control next to it — let the control's own empty/"None" value mean off.

### Extractors

An extractor is a named script that pulls a value out of a response. It replaced the Functions section, which is gone — the sidebar holds collections only, and `ActivePanel` is `request | settings`.

`src/lib/extractors.ts` is the engine: `runExtractor()` evaluates the script with `response` in scope (JSON bodies arrive parsed, repeated headers joined like `Headers.get()`), and never throws — it returns `{ success: false, error }`. Names are required and unique (`extractorNameProblem`).

- Managed from the title-bar **funnel** button (`iconExtractor`): `ExtractorsPopover` lists them, `ExtractorsDialog` edits one. The editor is **draft-based with an explicit Save**, unlike the rest of the app.
- Per request, `SavedRequest.extractor` (`ExtractorBar`, the row under the URL line) holds the toggle, the chosen extractor and an optional target variable. The checkbox is the disclosure — the rest of the row only renders when it is on.
- `runRequestExtractor()` runs after a successful send. With a target variable the value lands in the **active environment, or globals when none is active**; without one it opens `ExtractorResultDialog` to copy.
- Configs that still carry `functions` have each function's `extractorCode` carried over into an extractor (`legacyFunctionExtractors` in `config-normalize.ts`) — delete that branch once no config in the wild has them.

`Dropdown` (`src/react/components/Dropdown.tsx`) is the app's own listbox. Use it instead of a native `<select>` wherever the control sits in app chrome; a native one renders as OS chrome.

### It is an app, not a web page

The webview brings browser behaviour that has no place in a desktop app. What is already handled — do not undo it, and match it when adding surfaces:

- **Context menu** is the app's own (`src/app.ts` cancels `contextmenu` globally); **devtools** are debug-only (no `devtools` feature in `Cargo.toml`, so release builds have none); **zoom hotkeys** are off via Tauri's `zoomHotkeysEnabled` default.
- **`src/react/hooks/useNativeShell.ts`** suppresses reload, print, the webview find bar, view-source, ctrl-wheel zoom and stray file drops. It is release-only, so `tauri dev` keeps F5 as a development tool.
- **Spellcheck is off on `<body>`** in `index.html` and inherits everywhere. Red squiggles under a URL or a header value are a browser tell. Opt back in per element (`spellcheck="true"`) only for prose fields.
- **Never use `autoComplete="username"` / `"current-password"`** on auth fields. They are request parameters the user is composing, not a login for this app, and those values hand them to the webview's password manager. `SecretInput` defaults to `new-password`, which is the value that actually suppresses both the autofill dropdown and the save prompt.
- **Scrollbars** are styled for every theme, not scoped to dark — the webview default is instantly recognisable as a web page.
- **Persistence is files, never `localStorage`/`sessionStorage`** — see [Persistence](#persistence).

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

When adding a panel inside `.request-card`, it almost always mounts under **`.request-tab-panel`** (see `RequestEditor` in `src/react/components/RequestEditor.tsx`).

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

#### High-density datagrids / Excel-style spreadsheets (Globals & Environments)

RestPilot uses high-density Excel-style datagrids for Globals and Environment Variables.

**Rules for adding or editing spreadsheet tables:**
- **No Inline Labels**: Never render `<span class="variable-field-label">` inside row items. Stacking labels inside rows causes major row height bloat. Column headers belong exclusively in the table's header row (`.variables-table-head`, `.env-manage-var-head`).
- **Compact Row Height**: Spreadsheet rows (`.variable-item`, `.env-manage-var-row`) must have a uniform compact height. Row padding is `padding: 4px 12px !important` and input field height is `28px !important` to achieve exactly `36px` of total vertical row space.
- **Esc / Enter Escape Hatch**: All editable cell inputs must have keydown listeners that blur the active input when `Enter` or `Escape` is pressed.
- **No Token Preview Column**: Maximize horizontal width for actual variable names and values by completely excluding any token preview columns.

#### Rules (read every time)

| Goal | Do | Do not |
|------|----|--------|
| Panel fills remaining height below URL / card tabs | `flex: 1; min-height: 0` on the tab panel; `overflow-y: auto` on the **scrolling** child | `height: 100%` alone without `min-height: 0` on parents; scroll on `.request-card` |
| Tab bars, toolbars, URL line stay fixed height | `flex-shrink: 0` on `.tabs`, `.request-line`, `.body-toolbar`, `.request-tab-toolbar` | Let toolbars shrink or grow with leftover space |
| Short forms (auth, settings rows) stay **top-aligned** | On a `flex: 1` panel using **grid**: `align-content: start; align-items: start` (see `.request-tab-panel.request-auth-panel`) | Default grid/flex stretch—fields spread vertically with huge gaps |
| Settings label + checkbox/toggle on one row | `.settings-toggle-row`: `inline-grid` + `grid-template-columns: auto auto` + `width: fit-content`. Parent rows (e.g. `.settings-network-general`) use `flex-wrap`, not `1fr` beside the control | `grid-template-columns: 1fr auto` on toggles, or a parent column `1fr` that stretches the label away from the checkbox |
| Settings proxy URL / secret fields | `.settings-input-shell` + `.settings-input-trailing` (× then 👁 inside the input, right-aligned). Copy from `src/react/components/SettingsPanel.tsx` | External grid columns for × / 👁 beside the input |
| Long lists (params, headers) | Wrapper with `flex: 1; min-height: 0; overflow: auto` (`.request-pairs-list`) | List without `min-height: 0`—parent won't scroll |
| Two columns (request / response) | `.editor-grid` with `grid-template-rows: minmax(0, 1fr)` and cards `height: 100%` | Row height `auto` only—cards stay minimum height |
| Hide one of several variants | `is-hidden` class + `display: none` in CSS (append it in the JSX `className`) | HTML `hidden` attribute alone (overridden by `display: grid`/`flex`); `visibility: hidden` when space must collapse |

#### Conditional sections (mutually exclusive blocks)

- Markup: `className={`block${visible ? "" : " is-hidden"}`}`.
- CSS: scoped rule, e.g. `.my-panel .my-block.is-hidden { display: none; }`.
- Runtime (non-React overlays only): `element.classList.toggle("is-hidden", !visible)`.
- Example: `src/react/components/RequestEditor.tsx` + `.request-auth-panel .auth-fields.is-hidden`.

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

Auto-mapping a function result to a variable is **per function**, not a user preference — see [Functions](#functions).

### Proxy (user settings)

Settings UI: `src/react/components/SettingsPanel.tsx`. Persisted in `AppConfig.settings.proxy` via `proxyPayload()` in `src/app/persistence.ts`. Normalized in `normalizeProxySettings()` (`src/app/proxy-settings.ts`).

| Field | Meaning |
|-------|---------|
| `mode` | `none` — direct connection. `system` — OS/PAC (Windows: WinHTTP). `environment` — selected process environment variables. `manual` — full proxy URLs below. |
| `httpProxy` / `httpsProxy` | Full URL, e.g. `http://user:pass@proxy.example.com:8080`. Manual mode only. For HTTPS targets, HTTPS proxy alone is enough. |
| `noProxy` | Comma-separated hosts bypassing the proxy (e.g. `localhost,127.0.0.1`). Merged with process `NO_PROXY` when set. |
| `useHttpProxyEnv` / `useHttpsProxyEnv` / `useNoProxyEnv` | Select which of `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` participate in Environment variables mode. |
| `authMode` | `auto` (default), `basic`, `ntlm`, `negotiate`. Preset to `auto` when switching to system, environment, or manual. |
| `proxyTestUrl` | URL used by the Settings **Test** button (same stack as real requests). Test output is a step log dialog (redacted). |

**Do not change proxy/HTTP connection behavior** (`src-tauri` HTTP stack, `curl` dependency, `.cargo/config.toml` NTLM flags) **without explicit user confirmation.** Documentation-only updates are fine.

### Proxy (runtime behavior)

**Engine selection** (`src-tauri/src/http_curl.rs`, `should_use_curl`):

| Situation | Engine |
|-----------|--------|
| `mode === "none"` | reqwest, no proxy |
| `mode === "manual"` + `authMode === "basic"` | reqwest + Basic proxy auth |
| `mode === "manual"` + `authMode` auto / ntlm / negotiate | **libcurl** (blocking thread) |
| `mode === "environment"` + `authMode === "basic"` | reqwest + selected environment proxy |
| `mode === "environment"` + `authMode` auto / ntlm / negotiate | **libcurl** + selected environment proxy |
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

### Headers and response body

- **Headers are ordered `[name, value]` pairs (`HeaderPair[]` in TS, `Vec<(String, String)>` in Rust), never a map/object.** A `HashMap`/`Record` silently collapses repeated header names (multiple `Set-Cookie`, a request sending two `Accept` values); this was a real bug and must not come back. When building outbound headers, use `HeaderMap::append` in Rust (not `insert`), and array `.filter()`/`.push()` in TS (see `src/app/request-auth.ts`, `src/app/request-utils.ts`, `src/lib/curl.ts`) — never `Object.fromEntries`/`Object.entries` on headers.
- Extractor scripts (Functions feature, `src/app/function-http.ts`) get a **derived** case-insensitive lookup object (`headerLookupObject`) built from the pairs, so `response.headers["content-type"]` keeps working for user scripts — that object is a read-only view, not the source of truth.
- **Response bodies are binary-safe.** `ApiResponse.body` is UTF-8 text when the response decodes as valid UTF-8; otherwise it's base64 and `body_is_base64` is `true` (`decode_response_body()` in `src-tauri/src/lib.rs`). Never assume `body` is always text-displayable — check `body_is_base64` before formatting/highlighting/pretty-printing it (see `ResponsePanel.tsx`'s `BinaryBodyPlaceholder`).
- **`body_size` is the real byte count**, independent of `body`'s encoding. Use it for any displayed size (`formatBytes(response.body_size)`) instead of `body.length`, which is wrong for base64 (inflated) and for multi-byte UTF-8 text (undercounts).
- Streaming responses (`stream: true`) are always decoded as lossy UTF-8 chunk-by-chunk — binary-safe decoding only applies to the buffered, non-streaming path. This is a documented limitation, not a bug to fix reflexively.
- `config-normalize.ts` exports `normalizeApiResponse` / `normalizeSavedResponseHistoryItem`, which tolerate the legacy `Record<string,string>` header shape and missing `body_is_base64`/`body_size` from configs saved before this model existed. Reuse them for any new place that reads a stored `ApiResponse` — don't re-implement normalization inline.

## Dialogs

- Two dialog systems coexist: **`applicationDialog`/`messageDialog`** (`src/components/dialogs.ts`, imperative HTML string templates rendered into `AppDialog.tsx`) for anything historically ported from the vanilla-JS app, and plain **React components** for everything newer. Prefer extending an existing `applicationDialog` mode over inventing a third pattern; don't rewrite an existing mode into React as a drive-by.
- **Adding a new `applicationDialog` mode** (e.g. a new import source, a new export option) touches all of these — missing one leaves the dialog partially wired:
  1. Add the mode string to `DialogMode` in `src/components/dialogs.ts`.
  2. Build the `previewHtml` string template where the dialog is opened (see `src/import/source-dialog.ts` for the pattern) and pass it via `applicationDialog({ mode, previewHtml, ... })`.
  3. If the dialog has live behavior (toggling sections, validating input as the user types) add it to `bindDialogPreviewContent()` — this runs once after the preview HTML mounts and on every re-render.
  4. If the dialog's result needs custom fields beyond the default action id, add a branch to `captureDialogForm()` reading from `root.querySelector(...)`, and add the mode to the list in `closeDialog()` that resolves `{ action, data }` instead of a bare string.
  5. If the mode needs dedicated layout/spacing, add a `mode === "..."` branch in `bodyClassName()` in `src/react/components/dialogs/AppDialog.tsx` and scope new CSS under that class in `src/styles.css`.
  6. All copy goes through `t().collection` (or the relevant namespace) in `src/i18n/en.ts` **and** `src/i18n/es.ts` — never hardcode strings in the template.

## Import

- Import sources: RestPilot's own export (JSON), Postman v2.1 (JSON), OpenAPI 3.x/Swagger 2.0 (**JSON or YAML** — `parseSpecDocument()` in `src/import/openapi.ts` tries `JSON.parse` then falls back to the `yaml` package), and raw cURL. Each parser (`src/import/postman.ts`, `src/import/openapi.ts`, `parseCollectionExport` in `src/app/collection-format.ts`, `parseCurl` in `src/lib/curl.ts`) produces the shared `ImportParseResult` (`src/import/types.ts`): `{ folders, requests, tree, name, description }`.
- **OpenAPI `$ref` resolution** lives in `src/import/openapi-ref.ts` (`dereference()` for JSON Pointers into the document root, `synthesizeExample()` for turning a — possibly `$ref`'d — JSON Schema into a plausible example value). Both are bounded: `dereference` guards against ref cycles (A → B → A), `synthesizeExample` stops after `MAX_SCHEMA_DEPTH` levels so a self-referencing schema (a `Node` with `children: Node[]`, common for trees/threads) terminates instead of recursing forever. Any new field read off an operation/parameter/schema in `src/import/openapi.ts` that *could* be a `$ref` per the OpenAPI spec (parameters, `requestBody`, any `schema`) must go through `dereference()` first — reading `.in`/`.name`/`.properties` etc. straight off a `$ref` object silently returns `undefined` instead of erroring, which is an easy way to reintroduce "real specs import empty."
- Two entry points share the same parse → preview → apply pipeline (`src/import/source-dialog.ts`, `src/import/index.ts`):
  - **Import collection** (`startImport`): pick a source, then a file (or paste for cURL).
  - **Import from text** (`startImportFromText`): paste anything into one textarea; `detectImportSource()` (`src/import/detect.ts`) sniffs the format live as the user types and the same parser runs once they continue. Cheap sniffing only (curl prefix, then JSON with a `format`/`openapi`/`swagger`/`item`+`info` shape check) — it must stay fast enough to run on every keystroke.
  - Both funnel through `parseBySource()` and `finishImport()` in `source-dialog.ts` (shared error handling + the selection/target-folder preview dialog). Add new sources there, not by duplicating the dialog flow.
- **Adding a new import source:** add the value to `ImportSource` (`src/import/types.ts`), write a `parseXxx(raw: string): ImportParseResult` module, add a detection branch in `detectImportSource()`, wire it into `parseBySource()`, and add `importSourceXxx`/`importSourceXxxDesc` labels to both i18n files (reused as the "Detected format: {format}" text in the text-import dialog too).

## Functions

### Result auto-mapping (per function)

Each `AppFunction` carries its own auto-map config: `autoMapEnabled`, `autoMapVariable`, `autoMapScope` (`global` | `environment`), normalized in `normalizeFunction()`. Edited in the function workspace header (`FunctionAutoMapField` in `src/react/components/functions/FunctionAutoMapField.tsx`) — **do not turn this into a global setting**; different functions map to different variables.

When a function has it enabled with a non-blank name, running it stores the extracted value in that variable (created when missing, overwritten without confirmation) and shows a toast instead of the "Inject into Variable" dialog — `autoMapFunctionResult()` in `src/app/function-auto-map.ts`, called from `runSidebarFunctionAction`. Environment scope falls back to globals when no environment is active. Functions without it keep the dialog.

The variable-name field uses `VariableNameInput` (`src/react/components/VariableNameInput.tsx`), a bare-name autocomplete over `getEffectiveVariables()`; `VariableInput` remains the `{{…}}` template-completing input used by headers/params.

## Collection tree

- Collection order is a flat `items[]` with `parentId`. Drag-and-drop must support reordering, nesting folders, moving requests between folders, and moving items to the root.

## Startup and performance

- **Release builds** are the benchmark for startup UX: the static shell in `index.html` paints immediately, then `src/bootstrap.ts` fires both startup IPC reads in parallel, applies theme/locale, mounts React and runs `startApp`.
- **`src/bootstrap.ts` imports the UI statically, on purpose.** A `import()` there hides `react/main`, `app.ts` and `styles.css` from `index.html`, so Vite emits no `modulepreload`/`<link rel=stylesheet>` and the browser cannot start fetching them until the entry chunk has executed — that serialised waterfall is what left release builds blank for seconds. Keep the UI in the entry graph and verify after any change that `dist/index.html` still carries both the script tag and the stylesheet link.
- **Nothing large may be awaited before `finishBoot()`.** CodeMirror is warmed with a floating `preloadEditorRuntime()`; each editor host mounts itself when the chunk lands (`CodeMirrorEditor`), so awaiting it only delays the whole window by ~390 kB. `finishBoot()` runs *after* `render()` so the first visible frame is already populated.
- **`tauri dev` is expected to feel much slower** (unbundled modules, HMR, no minification). Do not treat dev startup time as a regression if release/`tauri build` feels instant — that is the target for the shipped app.
- If the user reports a blank screen for several seconds, verify **release** first before chasing dev-only slowness.

## Source layout

- `src/bootstrap.ts` — entry: parallel startup-prefs + config IPC, then `mountReactApp()` and `startApp()` (static imports — see [Startup and performance](#startup-and-performance)).
- `src/react/hooks/useNativeShell.ts` — suppresses leftover browser behaviour (reload, print, find, zoom, file drops) in release builds so the window feels native.
- `src/app.ts` — startup sequence, context-menu handlers and a few app-level actions. React owns rendering (`src/react/App.tsx`).
- `src/main.ts` — re-exports `bootstrap` (Vite entry compatibility).
- `src/app/state.ts` — shared `state`, IDs, collection lookups, formatting helpers.
- `src/app/persistence.ts` — config load/normalize/save (`scheduleSave`, `persistConfig`).
- `src/app/collection-store.ts` — tree reorder inserts/moves (calls `render()` via `app/render.ts`).
- `src/app/request-utils.ts` — blank request factory, content-type, form payload for HTTP.
- `src/app/render.ts` — `render()` dispatcher so non-UI modules can request a re-render without importing `main.ts`.
- `src/lib/curl.ts`, `src/lib/url-params.ts`, `src/lib/variables.ts`, `src/lib/content-display.ts` — pure helpers covered by unit tests.

## Tests

- Run locally: `npm test` (Vitest). No GitHub Actions workflow is configured; do not add push-triggered CI unless explicitly requested.
