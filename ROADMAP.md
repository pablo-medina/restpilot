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

**Exit criteria (adjusted):** critical paths covered by tests (`npm test`); persistence and collection logic live outside `main.ts`; no automatic CI on push unless you opt in later. Further UI extraction from `main.ts` is optional follow-up.

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
| 1.6 | **Multipart persistence UX** — warn when file parts are not saved; hint in UI | Settings copy + send guard | done |

**Exit criteria:** Common flows doable without mouse; URL/query editing matches header table ergonomics.

---

## Phase 2 — Collections at scale (core product)

Goal: real projects with dev/staging/prod and portable data.

| # | Item | Scope | Status |
|---|------|--------|--------|
| 2.1 | **Environments** — named sets of variables; one active environment | `AppConfig.environments`, UI in Variables or dedicated panel | planned |
| 2.2 | **Per-request environment override** (optional) — inherit global env | Advanced; can defer | planned |
| 2.3 | **Export collection** — JSON snapshot (items + variables + folders, no secrets option) | File dialog via Tauri | planned |
| 2.4 | **Import collection** — merge or replace; conflict policy (rename/skip) | Dialog + validation | planned |
| 2.5 | **Collection search** — filter tree by title, URL fragment, method | Explorer tree | planned |
| 2.6 | **Auth helpers** — Bearer, Basic, API key (header/query); maps to headers | Auth section on request; no OAuth server yet | planned |
| 2.7 | **Secret variables** — mask in UI; exclude from cURL copy unless confirmed | Variable flag `secret?: boolean` | planned |

**Exit criteria:** Switch environment and re-run suite; backup/restore collection on another machine without hand-editing `config.json`.

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

**Exit criteria:** Debug session without re-typing; folder smoke test in one action.

---

## Explicitly out of scope (for now)

These conflict with “lightweight / local-first” unless requirements change:

- Cloud sync, accounts, shared workspaces
- Full Postman feature parity (scripts, mocks, public documentation)
- GraphQL IDE, WebSocket client, gRPC (separate products or major version)
- OAuth 2.0 authorization-code flow with built-in browser (large surface; consider later as plugin-style feature)

---

## Suggested release themes

| Theme | Phases | User-facing headline |
|-------|--------|----------------------|
| **v0.2 — Solid ground** | 0 + 1.1–1.3 | “Faster to use every day” |
| **v0.3 — Real projects** | 1.4–1.6 + 2.1–2.4 | “Environments and portable collections” |
| **v0.4 — Team-ready local** | 2.5–2.7 + 3.1–3.3 | “Search, auth, history, batch run” |
| **v0.5+ — Enterprise edge** | 3.4–3.6 | “TLS, certs, export at scale” |

Versions are indicative; ship when exit criteria for the theme are met.

---

## Implementation notes (from current codebase)

- **Persistence:** extend `AppConfig` in `src/types.ts`; migrate in `normalizeConfig()` in `main.ts`; never use `localStorage`.
- **i18n:** every user string in `src/i18n/en.ts` and `src/i18n/es.ts`.
- **Dialogs:** `messageDialog` / `applicationDialog` from `src/components/dialogs.ts`.
- **HTTP:** Rust `send_request` in `src-tauri/src/lib.rs`; pass `proxy` from settings.
- **Variables today:** global list + `applyVariables()` at send time — environments layer on top without breaking `${name}` syntax.

---

## How to use this doc

1. Pick the next open item in the earliest incomplete phase.
2. Update the **Status** column when starting or finishing work.
3. Keep PRs scoped to one roadmap row when possible.
4. Revisit **Out of scope** each major version if user demand shifts.

_Last updated: 2026-05-17_
