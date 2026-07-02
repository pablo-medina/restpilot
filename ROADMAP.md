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
| 1.11 | **Response time breakdown** — DNS, TCP, TLS, first byte, total | Rust timing in `send_request` + frontend display | planned |

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
| 2.8 | **Import from Postman** — convert Postman collection v2.1 to native format | `src/import/postman.ts` — new module | planned |
| 2.9 | **Import OpenAPI/Swagger** — convert OpenAPI 3.x spec to collection | `src/import/openapi.ts` — new module | planned |
| 2.10 | **Import HAR** — HTTP Archive format to request collection | `src/import/har.ts` — new module | planned |
| 2.11 | **Collection-level metadata** — name, description, icon/color for the root folder | Extend `AppConfig` with `collectionMeta` | planned |
| 2.12 | **Bulk operations** — multi-select items for batch delete, export, move | Tree multi-select + action bar | planned |
| 2.13 | **Persist multipart file selections** — store file paths (not base64) so uploads survive restart | Replace base64 with file path in `Pair.fileName`; read on send | planned |

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
| 3.8 | **Variable chaining** — resolve `${...}` inside variable values (recursive, cycle-guarded) | `src/variables.ts` — recursive `applyVariables` | planned |
| 3.9 | **Pre-request scripts** — JavaScript sandbox to set variables before send | QuickJS or similar embedded runtime; separate `src/scripting/` | planned |
| 3.10 | **Post-response tests** — assertions on status/body/headers with pass/fail UI | `src/testing/` — test script editor + results display | planned |
| 3.11 | **Per-request proxy override** — override global proxy per request or per-folder | Extend `SavedRequest` with optional `proxyOverride` | planned |
| 3.12 | **Cookie management** — cookie jar UI, view response cookies, manual cookie editing | `src/cookies/` — cookie store + editor panel | planned |
| 3.13 | **Auth: Digest** — HTTP Digest authentication | Extend `RequestAuthType` + Rust `send_request` | planned |
| 3.14 | **Auth: OAuth 2.0 client credentials** — token fetch + auto-refresh (no browser redirect) | New auth type + Rust token client | planned |

**Exit criteria:** Debug session without re-typing; folder smoke test in one action; scripting for dynamic workflows.

---

## Phase 4 — UX depth & polish

Goal: refined experience across all surfaces — search, navigation, context menus, tabs.

| # | Item | Scope | Status |
|---|------|--------|--------|
| 4.1 | **Tab context menu** — right-click tab for Close, Close Others, Close to Right, Close All | `src/app/context-menu.ts` — `request-tab` kind is typed but not rendered | planned |
| 4.2 | **Context menu keyboard navigation** — Arrow/Tab/Enter within menus | `src/app/context-menu.ts` | planned |
| 4.3 | **Tree virtual scrolling** — virtualized collection tree for large collections | New virtual-list module (legacy `virtual-list.ts` removed) | planned |
| 4.4 | **Search in responses** — filter response body text (case-insensitive, highlight) | Response panel search bar | planned |
| 4.5 | **Search in variables** — filter global/env variable tables | Variables workspace search | planned |
| 4.6 | **Search highlighting** — bold/color matched text in tree items and variable rows | Collection tree + variable panels | planned |
| 4.7 | **Pinned tabs** — pin requests to stay open (VS Code style) | Tab state `pinned: boolean` | planned |
| 4.8 | **Toast notification system** — non-blocking success/error/info toasts | `src/components/toast.ts` — reusable, auto-dismiss | planned |
| 4.9 | **Loading/skeleton states** — skeleton placeholders during config load and request send | `.skeleton` CSS + HTML placeholders | planned |
| 4.10 | **Collapse all / Expand all** in collection tree | Tree toolbar buttons | planned |
| 4.11 | **Drag ghost improvement** — show request title/method in drag ghost; touch support | `src/app/pointer-reorder.ts` | planned |
| 4.12 | **Improve multipart file UX** — warn before close that file parts will be lost on restart | Save guard + UI hint in request tab | planned |

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

---

## Known technical debt & risks

| # | Issue | Impact | Suggested approach |
|---|-------|--------|--------------------|
| T1 | **`src/app.ts` ~4600 lines** — monolithic, hard to test | Every change risks regression; new contributors overwhelmed | Continue extracting to `src/ui/` and `src/app/` modules |
| T2 | **Full re-render pattern** — `innerHTML +=` on every change | Fragile; one bad template breaks entire panel; loses DOM state (scroll, focus) | Selective re-render: only update changed sections |
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
- **Variables today:** global list + `applyVariables()` at send time — environments layer on top without breaking `${name}` syntax.
- **Autocomplete:** Variable autocomplete in `src/variable-autocomplete.ts`, bound to URL + all pair inputs + auth fields.

---

## How to use this doc

1. Pick the next open item in the earliest incomplete phase.
2. Update the **Status** column when starting or finishing work.
3. Keep PRs scoped to one roadmap row when possible.
4. Revisit **Out of scope** each major version if user demand shifts.

_Last updated: 2026-05-21 — Comprehensive gap analysis completed. Added Phases 4-5, expanded Phases 1-3, added tech debt section, and updated release themes._
