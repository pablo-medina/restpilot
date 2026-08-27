# RestPilot roadmap

Lightweight, local-first REST client. This roadmap prioritizes features that fit the product identity (calm UI, no cloud account) and technical work that keeps the codebase maintainable as it grows.

**Status key:** `planned` · `in progress` · `done`

---

## Vision

RestPilot should be the default choice when you need a **fast, private, native** HTTP client — not a full Postman replacement. Success looks like: reliable day-to-day API work, portable collections, and a codebase small enough to extend without fear.

---

## Phase 0 — Foundation (maintainability)

Goal: make future features safe to ship.

| # | Item | Scope | Status |
|---|------|--------|--------|
| 0.1 | **Unit tests** for `curl.ts` (parse, generate, edge cases) | `src/curl.ts` | done |
| 0.2 | **Unit tests** for variable substitution and content helpers | `applyVariables`, `content-display.ts` | done |
| 0.3 | **CI workflow** — `npm run build`, `tsc`, tests on push/PR | `.github/workflows/` | deferred |
| 0.4 | **Split `main.ts`** into focused modules (tree, workspace, persistence, HTTP) | `src/app/*` extracted; UI split continues in `src/ui/` | in progress |
| 0.5 | **Document dev conventions** in `AGENTS.md` (module boundaries after split) | Docs only | done |
| 0.6 | **Tests for `app.ts` bindings** — cover critical rendering/binding paths (URL input, auth panel, pairs, send flow) | `src/app.ts` + test setup | planned |
| 0.7 | **Split `src/styles.css`** (~6200 lines) into per-module/component CSS files | `src/styles/` with `variables.css`, `layout.css`, `components/` | planned |
| 0.8 | **E2E tests** — Playwright/WebDriver + Tauri for full flows (create → send → view response) | `tests/e2e/` | planned |
| 0.9 | **Unify response body rendering** — always readonly CodeMirror; drop the regex-based `<pre>` highlighter used today for bodies under 48 KB | Removes `highlightResponse`/`highlightJson`/`highlightXml` + cache in `src/lib/content-display.ts`; makes line numbers/search/folding (0.9-adjacent, see 1.12) apply to every response size, not just large ones | planned |
| 0.10 | **Regroup `src/ui/` by what it actually does** — pure helpers with no DOM access (`response-panel.ts`, `collection-tree.ts`) move to `src/lib/`; `src/ui/` keeps only code that touches the DOM outside React (`window-chrome.ts`, `request-popovers.ts`, `large-text-editor.ts`) | `src/ui/*` → `src/lib/*` | planned |
| 0.11 | **Replace ad-hoc inline `style={{...}}` blocks** in `RequestEditor` (binary/GraphQL panels), `ResponsePanel` (saved-response dropdown), and `VariablesSidebar` with CSS classes using `--rp-*` tokens — inline styles don't consistently follow the dark theme | `src/styles.css` | planned |
| 0.12 | **Separate UI state from data in the save path** — every keystroke schedules a full `persistConfig()`; split so typing doesn't re-serialize the whole config on each debounce tick | `src/app/persistence.ts` | planned |
| 0.13 | **Finish moving window chrome off imperative DOM writes** — `syncMaximizeControl()` still sets `innerHTML` directly on a node React owns (mitigated to target an inner `<span>`, but not the real fix); replace with React state fed by `getCurrentWindow().onResized()` | `src/ui/window-chrome.ts`, `TitleBar.tsx` | planned |

**Exit criteria (adjusted):** critical paths covered by tests (`npm test`); persistence and collection logic live outside `main.ts`; CSS split into manageable modules.

**0.3 note:** Run `npm test` and `npm run build` locally before pushing. GitHub Actions can be added later with `pull_request` + path filters only, if you want automation without email noise on every push.

---

## Phase 1 — Daily workflow (quick wins)

Goal: faster iteration for power users without new concepts.

| # | Item | Scope | Status |
|---|------|--------|--------|
| 1.1 | **Keyboard shortcuts** — Send (`Ctrl+Enter`), close tab, focus URL, tree navigation | i18n hints in settings or help strip | done |
| 1.2 | **Copy response** — body, headers, status line | Response panel actions | done |
| 1.3 | **Query params table** — parse/sync with URL (`?a=1&b=2`), same UX as headers | Request builder | done |
| 1.4 | **Variable preview** — show resolved URL (and optional tooltip) before send | Uses existing `applyVariables` | done |
| 1.5 | **Network settings** — request timeout, follow redirects on/off | `UserSettings` + Rust `send_request` | done |
| 1.7 | **Manual proxy + NTLM (libcurl)** — Auto auth, vendored curl, Settings test | `http_curl.rs`, `.cargo/config.toml` | done |
| 1.6 | **Multipart persistence UX** — warn when file parts are not saved; hint in UI | Settings copy + send guard | done |
| 1.8 | **Code generation** — export request as code (JS fetch, Python requests, Go, cURL) | `src/codegen/` — new module, reuse existing curl.ts patterns | planned |
| 1.9 | **Global request history** — last N sends across all requests (ephemeral, capped) | `AppState.requestHistory` — separate from per-request savedResponses | planned |
| 1.10 | **More keyboard shortcuts** — `Ctrl+N` new request, `Ctrl+S` save (visual feedback), `Ctrl+D` duplicate, `Escape` close sidebar | `src/shortcuts.ts` + bindings | planned |
| 1.11 | **Response time breakdown** — DNS, TCP, TLS, first byte, total, plus the redirect chain with the final URL (today `followRedirects` is on by default and the user never sees that a redirect happened) | Rust timing via libcurl `CURLINFO_*` (already used for proxy) + frontend display | planned |
| 1.12 | **Enrich the CodeMirror body editor** — line numbers, code folding, in-editor search (`Ctrl+F`), bracket matching/auto-close, a JSON linter that flags syntax errors before sending | `src/ui/large-text-editor.ts` `baseExtensions()` — all official CodeMirror extensions already in the dependency tree, no new deps | planned |
| 1.13 | **Visible "Format" button** for the body editor (JSON/XML) | Body toolbar, next to the format selector; `Ctrl+Shift+F` already does this but is undiscoverable | planned |
| 1.14 | **Configurable line-wrap toggle** — shared between the request body editor and the response viewer, persisted in settings | `UserSettings` + `large-text-editor.ts` | planned |
| 1.15 | **Response body toolbar** — Pretty/Raw toggle (today formatting is always forced, no way to see the raw body), search, wrap on/off, direct Copy and Save-to-file (no context menu detour) | `ResponsePanel.tsx` | planned |
| 1.16 | **Actionable error states** — short title + detail + a concrete next step (timeout → raise the Settings timeout; DNS failure → check the URL; 407 → configure the proxy) plus a **Retry** button, instead of the raw error string | `ResponsePanel.tsx` | planned |
| 1.17 | **Tab item counters** — `Params (3)`, `Headers (8)`, and a dot on **Auth**/**Body** when configured (auth ≠ none, body ≠ none); counts enabled items only | `RequestEditor.tsx` tab bar | planned |
| 1.18 | **Persistent stream-response toggle + "Copy as cURL" in the copy menu** — move "stream response" out of the context-menu-only spot into a visible toggle on the body toolbar (it changes how the response renders, so it deserves to be visible) | `RequestEditor.tsx`, `ContextMenu.tsx` | planned |
| 1.19 | **Resolved-URL tooltip on Send** — when variables are active, the sent URL can differ from the displayed one; show the fully-resolved URL (secrets masked) on hover | `RequestEditor.tsx` | planned |

**Exit criteria:** Common flows doable without mouse; URL/query editing matches header table ergonomics.

---

## Phase 2 — Collections at scale (core product)

Goal: real projects with dev/staging/prod and portable data.

| # | Item | Scope | Status |
|---|------|--------|--------|
| 2.1 | **Environments** — named sets of variables; one active environment | `AppConfig.environments`, chip + popover + manage dialog | done |
| 2.2 | **Per-request environment override** (optional) — inherit global env | Advanced; deferred | deferred |
| 2.3 | **Export collection** — JSON snapshot (items + variables + folders, no secrets option) | File dialog via Tauri | done |
| 2.4 | **Import collection** — merge or replace; conflict policy (rename/skip) | Dialog + validation | done |
| 2.5 | **Collection search** — filter tree by title, URL fragment, method | Explorer tree | done |
| 2.6 | **Auth helpers** — Bearer, Basic, API key (header/query); maps to headers | Auth section on request; no OAuth server yet | done |
| 2.7 | **Secret variables** — mask in UI; exclude from cURL copy unless confirmed | Variable flag `secret?: boolean` | done |
| 2.8 | **Import from Postman** — convert Postman collection v2.1 to native format | `src/import/postman.ts` | done |
| 2.9 | **Import OpenAPI/Swagger** — convert OpenAPI 3.x spec to collection | `src/import/openapi.ts` + `openapi-ref.ts` — JSON or YAML, resolves `$ref` into `components/*` | done |
| 2.10 | **Import HAR** — HTTP Archive format to request collection | `src/import/har.ts` — new module | planned |
| 2.11 | **Collection-level metadata** — name, description, icon/color for the root folder | Extend `AppConfig` with `collectionMeta` | planned |
| 2.12 | **Bulk operations** — multi-select items for batch delete, export, move | Tree multi-select + action bar | planned |
| 2.13 | **Persist multipart file selections** — store file paths (not base64) so uploads survive restart | Replace base64 with file path in `Pair.fileName`; read on send | planned |
| 2.14 | **More productive params/headers rows** — optional **Description** column (useful for documentation and HTML export); bulk edit (toggle between the table and a `key: value` per-line textarea, the thing most missed when pasting headers from devtools); IANA standard header-name autocomplete (offline, bundled list); visually mark headers RestPilot adds automatically (`Content-Type` derived from body mode, auth) so it's clear where they came from | `PairRow.tsx`, `HeadersTable.tsx` | planned |
| 2.15 | **Path variables** — recognize `:id` / `{id}` in the URL and offer a "Path variables" sub-section under Params, resolved at send time | `RequestEditor.tsx`, `lib/url-params.ts` — pairs well with the OpenAPI importer's path params (2.9) | planned |
| 2.16 | **Redact secrets on export** — a toggle in the export dialog to strip auth values (bearer/basic/API key) from the exported file instead of writing them in plain text | `src/export/*` | planned |
| 2.17 | **Configurable response-history limits** — max saved responses per request, max body size to save, and an option to skip saving bodies over N MB | `responses.json` already keeps this out of `config.json` (see Persistence in `AGENTS.md`); this adds the size/count caps on top | planned |

**Exit criteria:** Switch environment and re-run suite; backup/restore collection on another machine without hand-editing `config.json`; import from at least Postman.

---

## Phase 3 — Power features (optional depth)

Goal: deeper workflows for teams and debugging — still local-first.

| # | Item | Scope | Status |
|---|------|--------|--------|
| 3.1 | **Request history** — last N sends (ephemeral or capped persist); click to reopen | Separate from saved requests | planned |
| 3.2 | **Compare responses** — diff two stored `lastResponse` or history entries | Read-only diff UI | planned |
| 3.3 | **Run folder** — sequential execution with delay; stop on first failure | Collection context menu | planned |
| 3.4 | **Response save to file** — export body (raw/prettified) | Tauri fs + dialog | planned |
| 3.5 | **TLS options** — trust custom CA; optional insecure mode (dev only, loud warning) | Rust client builder | planned |
| 3.6 | **Client certificates** — pick cert/key for mTLS | Settings or per-request | planned |
| 3.7 | **Dynamic variables** — `$randomInt`, `$timestamp`, `$guid`, `$randomEmail` etc. at send time | `src/variables.ts` — new `resolveDynamicVariable()` | planned |
| 3.8 | **Variable chaining** — resolve `{{...}}` inside variable values (recursive, cycle-guarded) | `src/variables.ts` — recursive `applyVariables` | planned |
| 3.9 | **Pre-request scripts** — JavaScript sandbox to set variables before send | Engine already embedded (`src-tauri/src/script.rs`); this is the hook point | planned |
| 3.9b | **Script library** — named JavaScript functions callable as `lib.<name>` from any script, with JSDoc-typed parameters, `env` writes and console output | QuickJS in Rust; `FunctionsDialog` + `run_script` | done |
| 3.9e | **`ui.showToast`** — a library function can put a message on screen, as text or `{title, message}` | Host function in the prelude; `startScriptToasts` bridge | done |
| 3.9d | **Extractors replaced by functions** — a request applies a library function; the target variable is optional | `FunctionBar`, `migrate-extractors.ts` | done |
| 3.9c | **`http.send` inside scripts** — synchronous HTTP from a script, through the same client as a normal request | Host function over `execute_request()` on the blocking script thread | planned |
| 3.10 | **Post-response tests** — assertions on status/body/headers with pass/fail UI | `src/testing/` — test script editor + results display | planned |
| 3.11 | **Per-request proxy override** — override global proxy per request or per-folder | Extend `SavedRequest` with optional `proxyOverride` | planned |
| 3.12 | **Cookie management** — cookie jar UI, view response cookies, manual cookie editing | `src/cookies/` — cookie store + editor panel | planned |
| 3.13 | **Auth: Digest** — HTTP Digest authentication | Extend `RequestAuthType` + Rust `send_request` | planned |
| 3.14 | **Auth: OAuth 2.0 client credentials** — token fetch + auto-refresh (no browser redirect) | New auth type + Rust token client | planned |
| 3.15 | **Response Preview tab** — the most visible gap versus Postman/Insomnia: render by `Content-Type` — `text/html` in a sandboxed iframe (no scripts, no network), `image/*` as a data URL, `application/pdf` as a "Save as…" prompt (no embedded viewer), everything else disabled with a tooltip explaining why | `ResponsePanel.tsx` | planned |
| 3.16 | **Cookies tab** — parse `Set-Cookie` response headers into a table (name, value, domain, path, expires, `HttpOnly`/`Secure`/`SameSite` flags) | `ResponsePanel.tsx` — needs multi-value headers, already in place | planned |

**Exit criteria:** Debug session without re-typing; folder smoke test in one action; scripting for dynamic workflows.

---

## Phase 4 — UX depth & polish

Goal: refined experience across all surfaces — search, navigation, context menus, tabs.

| # | Item | Scope | Status |
|---|------|--------|--------|
| 4.1 | **Tab context menu** — right-click tab for Close, Close Others, Close All | `ContextMenu.tsx` (`request-tab` kind) | done (no "Close to Right") |
| 4.2 | **Context menu keyboard navigation** — Arrow/Tab/Enter within menus | `src/app/context-menu.ts` | planned |
| 4.3 | **Tree virtual scrolling** — virtualized collection tree for large collections | New virtual-list module (legacy `virtual-list.ts` removed) | planned |
| 4.4 | **Search in responses** — filter response body text (case-insensitive, highlight) | Response panel search bar | planned |
| 4.5 | **Search in variables** — filter global/env variable tables | Variables workspace search | planned |
| 4.6 | **Search highlighting** — bold/color matched text in tree items and variable rows | Collection tree + variable panels | planned |
| 4.7 | **Pinned tabs** — pin requests to stay open (VS Code style) | Tab state `pinned: boolean` | planned |
| 4.8 | **Toast notification system** — non-blocking success/error/info toasts | `src/react/components/Toast.tsx` | done |
| 4.9 | **Loading/skeleton states** — skeleton placeholders during config load and request send | `.skeleton` CSS + HTML placeholders | planned |
| 4.10 | **Collapse all / Expand all** in collection tree | Tree toolbar buttons | planned |
| 4.11 | **Drag ghost improvement** — show request title/method in drag ghost; touch support | `src/app/pointer-reorder.ts` | planned |
| 4.12 | **Improve multipart file UX** — warn before close that file parts will be lost on restart | Save guard + UI hint in request tab | planned |
| 4.13 | **Draggable splitter between request and response panes** — `.editor-grid` is fixed at `minmax(420px, 0.95fr) / minmax(420px, 1.05fr)`; add a draggable divider plus a layout toggle (side-by-side / stacked), position persisted in settings | `UserSettings` (`editorSplitRatio`, `editorLayout`) + `styles.css` — also fixes cramped cards below ~1180px width | planned |
| 4.14 | **Inline collapsible request description** — `SavedRequest.description` today is only editable from a context-menu popover and never shown in the editor; add a "+ Add description" collapsible line under the URL (Insomnia-style) | `RequestEditor.tsx` | planned |
| 4.15 | **Open-tab limit** — optional cap on open tabs (off by default, 5), dropping the oldest least recently used tabs from the strip while the request stays in the collection; the active tab is always scrolled into view and marked VS Code style | `UserSettings` (`limitOpenTabs`, `maxOpenTabs`) + `src/app/tab-usage.ts`, `src/ui/tabs-bar.ts` | done |

**Exit criteria:** All surfaces searchable; tab management feels complete; visual feedback on all async operations.

---

## Phase 5 — Enterprise & integration

Goal: advanced HTTP features for corporate and integration scenarios.

| # | Item | Scope | Status |
|---|------|--------|--------|
| 5.1 | **SOCKS proxy** — SOCKS5 support for proxy modes | Rust: curl socks5 + reqwest socks feature | planned |
| 5.2 | **Binary/blob raw body** — `application/octet-stream` with file picker | `BodyMode` extend + Rust send | done |
| 5.3 | **GraphQL body type** — auto `application/json` with `{"query":...,"variables":...}` wrapper | UI convenience, no dedicated GQL IDE | done |
| 5.4 | **AWS Signature V4 auth** — sign requests for AWS API Gateway / S3 / Lambda | `RequestAuthType` extend + Rust signing | planned |
| 5.5 | **Per-request TLS options** — trust cert, insecure mode override per request | Extend `SavedRequest.network` | planned |
| 5.9 | **Update checker** — Tauri built-in updater for new versions | `tauri-plugin-updater` + release workflow | planned |

**Exit criteria:** Corporate proxy (SOCKS), cloud API signing (AWS), TLS controls, and update delivery operational.

---

## Explicitly out of scope (for now)

These conflict with "lightweight / local-first" unless requirements change:

- Cloud sync, accounts, shared workspaces
- Full Postman feature parity (scripts engine, mocks, public documentation)
- GraphQL IDE, WebSocket client, gRPC (separate products or major version)
- OAuth 2.0 authorization-code flow with built-in browser (large surface; consider later as plugin-style feature)
- Scheduled/monitored runs (uptime-style monitors, cron-triggered collection runs)
- A dedicated collection runner with historical pass/fail reports — basic sequential "Run folder" (3.3) stays in scope, a full runner UI does not
- Per-request assertions/tests as a first-class feature — covered well enough today by the existing **Functions** feature (custom extractor scripts)

---

## Known technical debt & risks

| # | Issue | Impact | Suggested approach |
|---|-------|--------|--------------------|
| T1 | ~~`src/app.ts` ~4600 lines~~ — resolved by the React migration; `app.ts` is now ~320 lines (startup + context-menu wiring only) | — | done |
| T2 | **Direct state mutation + coarse re-render** — most handlers mutate `state`/`item` fields in place and call `bumpRenderGeneration()` (a global counter bump) instead of React `setState`, so most UI changes re-render a large subtree instead of just the changed component | Works, but caps how much granular reactivity (`useStore` selectors) can help; a hot path (typing in a large body, big header lists) re-renders more than it needs to | Migrate hot-path components to immutable `setState` + `useStore` selectors incrementally, starting with the request/response editors |
| T3 | **No CI pipeline** — no automated checks on push | Broken code can land without detection | Add `.github/workflows/test.yml` with `npm test` + `tsc` |
| T4 | **Sanitize on save loses file parts** — `sanitizeItemsForSave()` clears multipart file values | Users lose file uploads after restart | Store file path instead of base64 content; read on send (see 2.13) |
| T6 | **No E2E tests** — only unit tests | Full-flow regressions undetected | Add Playwright/Tauri E2E (see 0.8) |

---

## Suggested release themes

| Theme | Phases | User-facing headline |
|-------|--------|----------------------|
| **v0.2 — Solid ground** | 0 + 1.1–1.3 | "Faster to use every day" |
| **v0.3 — Real projects** | 1.4–1.6 + 2.1–2.4 | "Environments and portable collections" |
| **v0.4 — Team-ready local** | 2.5–2.7 + 3.1–3.3 | "Search, auth, history, batch run" |
| **v0.5 — Code & history** | 1.8–1.11 + 2.8–2.10 | "Code generation, imports, request history" |
| **v0.55 — Editor & response depth** | 1.12–1.19 + 2.14–2.16 + 3.15–3.16 + 4.13–4.14 | "CodeMirror upgrades, response toolbar, Preview & Cookies tabs" |
| **v0.6 — UX depth** | 4.1–4.12 | "Polish, search everywhere, better tabs" |
| **v0.7+ — Enterprise edge** | 3.4–3.6 + 5.1–5.9 | "TLS, certificates, scripting, and integrations" |

Versions are indicative; ship when exit criteria for the theme are met.

---

## Implementation notes (from current codebase)

- **Persistence:** extend `AppConfig` in `src/types.ts`; migrate in `normalizeConfig()` in `main.ts`; never use `localStorage`.
- **i18n:** every user string in `src/i18n/en.ts` and `src/i18n/es.ts`.
- **Dialogs:** `messageDialog` / `applicationDialog` from `src/components/dialogs.ts`.
- **HTTP:** Rust `send_request` in `src-tauri/src/lib.rs`; pass `proxy` from settings.
- **Proxy (corporate NTLM):** documented in `AGENTS.md` → "Proxy (user settings)" / "Proxy (runtime behavior)". Manual + auth **Auto** uses libcurl NTLM on CONNECT; requires vendored libcurl with `CURL_ENABLE_NTLM` (see `.cargo/config.toml`). **Do not change the HTTP/proxy stack without user confirmation.**
- **Variables today:** global list + `applyVariables()` at send time — environments layer on top without breaking `{{name}}` syntax.
- **Autocomplete:** Variable autocomplete in `src/variable-autocomplete.ts`, bound to URL + all pair inputs + auth fields.

---

## How to use this doc

1. Pick the next open item in the earliest incomplete phase.
2. Update the **Status** column when starting or finishing work.
3. Keep PRs scoped to one roadmap row when possible.
4. Revisit **Out of scope** each major version if user demand shifts.

_Last updated: 2026-07-27 — Corrected statuses left stale by the React migration (2.8, 2.9, 4.1, 4.8 → done; T1 resolved, T2 rewritten to describe the current state-mutation pattern instead of the pre-React `innerHTML` one). 2.9 (OpenAPI import) now also handles YAML and resolves `$ref`. Not a full re-audit — other rows may still be stale; verify against the code before trusting an old "planned" label. Later the same day: merged in a separate request/response editor review (UX gaps found by comparing against Postman/Insomnia) as new items 0.9–0.13, 1.11 (extended)–1.19, 2.14–2.17, 3.15–3.16, 4.13–4.14, plus three "out of scope" clarifications. Its bug-fix findings (multi-value headers, binary-safe response bodies, response history moved out of `config.json`, delete-environment UI, missing settings hints) were already applied to the code before this merge and are not re-listed here as roadmap items — see `AGENTS.md` for the resulting HTTP/persistence/dialog conventions._

_Prior update: 2026-05-21 — Comprehensive gap analysis completed. Added Phases 4-5, expanded Phases 1-3, added tech debt section, and updated release themes._
