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

## UI and theming

- Respect the existing visual language in `src/styles.css` (zen palette, glass rail, folder/request icons).
- Reuse existing patterns: full re-render in `main.ts`, string templates, CSS classes.
- New surfaces should support **light** (default) and **dark** themes via `[data-theme]` on `document.documentElement`.
- When adding sections, tabs, or panels: match existing spacing and typography; verify **flex** layout (`min-height: 0`, `flex-shrink: 0` on tab bars, scroll on the correct child). Reuse `.segmented` / `.tabs` patterns instead of inventing new tab markup.
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

## HTTP

- Requests are sent through Tauri/Rust (`send_request`). Pass `proxy` from frontend settings.

## Collection tree

- Collection order is a flat `items[]` with `parentId`. Drag-and-drop must support reordering, nesting folders, moving requests between folders, and moving items to the root.

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

## Tests

- Run locally: `npm test` (Vitest). No GitHub Actions workflow is configured; do not add push-triggered CI unless explicitly requested.
