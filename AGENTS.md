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
