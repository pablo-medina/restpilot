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
- Dialogs:
  - `messageDialog` — kinds: `information`, `confirmation`, `warning`, `error` (fixed size)
  - `applicationDialog` — draggable; resizable when `resizable: true`; maximize/restore only when resizable

## Settings

- User preferences live in `AppConfig.settings` (theme, language, proxy).
- Proxy modes: `none`, `system`, `manual`. Default: `none`.

## HTTP

- Requests are sent through Tauri/Rust (`send_request`). Pass `proxy` from frontend settings.

## Collection tree

- Collection order is a flat `items[]` with `parentId`. Drag-and-drop must support reordering, nesting folders, moving requests between folders, and moving items to the root.
