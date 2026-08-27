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

**Restoring config into state is typed as the whole config.** `startApp` copies the loaded config into `state` field by field, and a field added to `AppConfig` but forgotten there is saved and never read back — which then blanks it on the next save. The object is annotated `Omit<AppConfig, "configVersion">` so leaving one out is a compile error, not something to discover after a restart.

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
- the standard close button (`iconWindowClose` in `.dialog-window-btn--close`) — **never a `×` text glyph**, whose size follows the font so no two of them ever match. `SettingsDialog`, `VariablesManagerDialog` and `PopoverShell` each shipped one anyway; they now use the control, and `.dialog-window-btn svg` sizes every window-button icon to 14px so the whole family agrees. The close hover tint is no longer scoped to `.app-dialog`, so a popover's close reddens like a dialog's,
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

Those three lay their content out in a column, where `align-items: stretch` is what pins the text left. An option that is a **row** — icon next to label, like `.sidebar-action-popover button` — also needs `justify-content: flex-start`, or the UA's `justify-content: center` centres the icon and label as a pair no matter what `text-align` says.

**A dropdown list is sized to its content, not to its trigger** — `width: max-content; min-width: 100%; max-width: min(420px, calc(100vw - 32px))`. Tying the list to the trigger's width leaves descriptions unreadable in a 120px control.

### Rows that toggle

A control row must not change height when its state changes, or everything below it jumps. Give the row a fixed height and keep the same controls mounted, disabling rather than unmounting them (see `.extractor-bar`). And do not add a checkbox whose only job is to reveal the control next to it — let the control's own empty/"None" value mean off.

### Breadcrumb (collection path above the URL)

`RequestBreadcrumb` (`src/react/components/RequestBreadcrumb.tsx`) is the first row of `.request-editor`: `Collection › folder › … › request` for the open request. It is a **fixed-height** row (see [Rows that toggle](#rows-that-toggle)) — a deeper path must never push the URL line down.

- Segments come from `collectionAncestorFolders()` (`src/app/collection-breadcrumb.ts`), the item-level counterpart of `collection-path.ts`'s string walk. Both guard against a parent cycle, so neither can hang the render on a hand-edited config.
- Every crumb calls `revealTreeItem()` / `revealCollectionRoot()` (`src/react/lib/collection-tree-actions.ts`): open the sidebar, expand the ancestors, select the row and scroll it into view. A crumb **never opens or switches a tab** — it navigates the tree, not the workspace.
- Opening the sidebar goes through `showSidebar()` in `sync-app-frame.ts`. Setting `state.sidebarVisible` alone does nothing: the layout is driven by the `is-sidebar-hidden` class that `syncAppFrameLayout()` writes on `#app`.
- Paths deeper than `MAX_FOLDER_CRUMBS` fold their middle into one `…` crumb whose tooltip lists the hidden folders; the root and the request keep their width and the folders between them truncate first.

### Extractors

An extractor is a named script that pulls a value out of a response. It replaced the Functions section, which is gone — the sidebar holds collections only, and `ActivePanel` is `request | settings`.

`src/lib/extractors.ts` is the engine: `runExtractor()` evaluates the script with `response` in scope (JSON bodies arrive parsed, repeated headers joined like `Headers.get()`), and never throws — it returns `{ success: false, error }`. Names are required and unique (`extractorNameProblem`).

- Managed from the title-bar **funnel** button (`iconExtractor`): `ExtractorsPopover` lists them, `ExtractorsDialog` edits one. The editor is **draft-based with an explicit Save**, unlike the rest of the app.
- Per request, `SavedRequest.extractor` (`ExtractorBar`, the row under the URL line) holds the toggle, the chosen extractor and an optional target variable. The checkbox is the disclosure — the rest of the row only renders when it is on.
- `runRequestExtractor()` runs after a successful send. With a target variable the value lands in the **active environment, or globals when none is active**; without one it opens `ExtractorResultDialog` to copy.
- Configs that still carry `functions` have each function's `extractorCode` carried over into an extractor (`legacyFunctionExtractors` in `config-normalize.ts`) — delete that branch once no config in the wild has them.

### Script library

A **library function** is a named piece of JavaScript reachable from any script as `lib.<name>`. It is a different thing from an extractor: an extractor is attached to a request and pulls a value out of one response, a library function is a reusable helper anything can call.

**The source is the only form.** The author writes an ordinary declaration —

```js
function doSomething(nrodoc) {
  console.log("DNI: " + nrodoc);
  return "hola";
}
```

— and the name and parameters are read back out of it. There is no name field and no parameter table; `Helper.name` and `Helper.params` are a **cache of the last parse**, kept only so the picker can show a signature without asking the engine, and never authoritative. `src-tauri/src/script_signature.rs` is the scanner (strings, comments and bracket depth, unit-tested); `describe()` runs it and then compiles the source so a syntax error is reported against what was written. The editor calls `parse_script` debounced while typing, which is also where live syntax errors come from.

The entry exports **the last top-level `function` declaration**, so private helpers can be written above it. `run_script` re-derives every entry's name from its own source, so a stale cache can never make `lib.<name>` resolve to the wrong function.

**Everything a run involves lives in `runHelper()`** (`src/react/lib/run-helper.ts`): work out the signature, ask for what is missing, run, apply what the script wrote to `env`, toast the variables it touched. It is not in the editor because **a run started from the picker never opens one** — clicking a row in `FunctionsPopover` runs its function, the pencil is what edits. Output goes to `ScriptResultDialog`; the editor renders the same `ScriptOutput` inline, so a run reads the same either way.

**Create function from response** (the braces button in the response panel) starts an entry whose parameter is called `response` and seeds the editor with the whole response as pretty-printed JSON — `{status, headers, body}`, headers as the lookup a script reads (repeats joined with ", "), body parsed so it shows as structure. `responseSampleJson()` builds it, `parseSampleResponse()` reads it back, and a pane the user has broken is reported rather than handed over as a string.

That sample is **scaffolding for that one editing session**, not a property of the function. It reaches the dialog through `openFunctionsDialog(id, { sample })` and nothing stores it — not `Helper`, not `config.json`, not a session map. **The editor is identical for every function**: reopening one that was created from a response later gives the plain single-pane editor like any other. While the sample pane is there, Run injects it as the first argument and asks only for the parameters after it.

**A function being created is added to the run library, not substituted into it.** `draftLibrary()` normally swaps the stored entry for the draft, but a new function is not in `state.helpers` at all until Save — substituting would leave it out and a first run before saving would fail with "Unknown library function".

**Editing lives in `useFunctionDraft` and `FunctionEditor`, not in the dialog.** The hook holds the draft, the debounced signature parse, whether it has been edited, running, saving and the discard guard; the component renders the signature, description, panes, run row and output. `FunctionsDialog` is only a frame — a title, a footer and the ways out. That split is what lets the same editing surface work in a full-window panel later without being written twice, so keep new editing behaviour in the hook or the component rather than in whatever is framing them.

`guard(proceed)` is the **one** unsaved-changes check, for every way out — cancel, close, and a panel's "switch to another function". Do not add a second one.

Its prompt passes `height: 0` to `applicationDialog`, which otherwise defaults to 420px — a mostly empty box around two lines of prose. Any confirmation of that size wants the same.

**Nothing is created by opening the editor.** A new function — from the picker or from Create function from response — is handed to the dialog through `openFunctionsDialog(id, { create })` and only reaches `state.helpers` on Save, so opening the editor and closing it leaves the library exactly as it was. Save is enabled only once the draft differs from what was opened, and closing an edited dialog asks before discarding. "Edited" means the **stored** fields only: the sample pane is scaffolding and `sampleArgs` is bookkeeping a run updates by itself, so neither makes a dialog dirty.

**The script editor is a mode of the body editor, not a second editor.** `mountBodyEditor(host, …, { script: true, libraryNames })` layers on the gutter, active line, bracket matching and completion; `CodeMirrorEditor` takes `script` and `libraryNames` to ask for it. It is opt-in so a JSON request body does not grow a gutter it never asked for, and `libraryNames` is read at mount — it is a fresh array on every render, so putting it in the effect's deps would remount mid-edit and throw away the cursor.

`scriptCompletions()` offers only what **this app** puts in scope — `env`, `lib`, `response`, `args`, `console`, plus the library after `lib.` — and leaves JavaScript itself to the language extension. A half-remembered subset of the standard library would be worse than none. It is exported and unit-tested: CodeMirror will not open a completion tooltip in an unfocused document, so the browser preview cannot exercise it.

A library completion carries its **signature** and inserts `name()` with the cursor between the parentheses. The signatures come from parsing each other entry's source when the editor opens, not from the cached `Helper.params` — the cache holds names only, and the types are the point. The list is read through a **getter**, so signatures that resolve a moment after the editor mounted are still offered without remounting it and losing the cursor.

**Tab takes the highlighted completion** while the list is open, wrapped in `Prec.high` — without it `insertTabKeymap` would insert spaces first. `acceptCompletion` declines when nothing is open, so Tab still indents the rest of the time.

The completion popup, gutter and active line are themed in `scriptTheme()` **inside the CodeMirror theme**, not in `styles.css`, for the same reason the syntax colours are: CodeMirror writes those values into its own stylesheet, so an `--rp-*` token resolves per theme and there is no light/dark pair to keep in step by hand. The selected row is an accent **tint** rather than a solid fill, because the detail text has to stay readable on it.

The **help button** beside Run opens `ScriptHelpDialog`: what is in scope, how JSDoc types the arguments, and where the edges are. Prose lives in i18n; the code sample does not, because it is JavaScript in both languages.

**One dialog, two scopes.** Opened on a single function — from a request, or from the picker's pencil — there is no catalogue, because there is nothing to switch to; a list rendered inert would be worse than no list. Opened with `{ library: true }` from the picker's **Open library** it comes up large with `FunctionList` beside the editor. Same `FunctionEditor` either way.

Switching rows goes through the same `guard()` as closing, and **saving does not close while browsing** — you are in the library, you stay in it. Coming from a request, saving is the end of the errand and the dialog closes. `save()` itself never closes: it re-seeds the baseline so the editor is no longer "edited", and the frame decides.

There is deliberately **no full-window panel**. `Workspace` still branches on `activePanel === "settings"` and `switchActivityPanel()` still exists, but **nothing calls it** — Settings went the same route (one `SettingsPanel`, rendered by a dialog) and the panel frame was left behind. A functions panel would be the only screen of its kind, so the editor is a resizable dialog instead. Revisit when ROADMAP 3.9/3.10 make scripting a workspace rather than something you open, edit and close.

**`AppModal` resizes and maximizes** (`resizable`), using the same `.resize-handle`/`.maximized` classes `AppDialog` has always had, so the existing styles apply unchanged. Handles are not rendered while maximized, and restoring returns the exact bounds it left. Maximized also drops `.app-modal`'s `max-height`, which exists to keep a *normal* dialog on screen and only fights a size that was already worked out.

**A code editor gets `--rp-bg`, not the dialog's surface.** CodeMirror is transparent, so without a background of its own the code area inherits `--rp-surface-raised` and ends up the *lightest* thing in the dialog — backwards for an editor, and in dark mode it reads as a wash of similar greys. `.extractors-pane .extractors-code` sets the app canvas instead: `#141312` in dark against the dialog's `#2a2926`, with the gutter a shade lighter at `#181715`.

Measuring a maximized dialog in the Browser pane gives numbers ~3% small: the `rp-dialog-appear` animation never finishes while the pane is not compositing, so it stays at its `scale(0.97)` first frame. Divide it out before concluding anything about margins.

Names are made unique at **creation**, not left for validation to complain about: `identifierFromTitle()` camel-cases the request's title (folding accents, lowercasing all-caps words) and `uniqueHelperName()` counts past whatever is taken — `example`, `example2`, `example3`. Uniqueness is not cosmetic: every entry is reached through the same `lib`, so two functions with one name would shadow each other with no way to tell which won.

Running **prompts for its arguments** (`ScriptArgsDialog`), the same way a request prompts for its `{{?parameters}}`. Both dialogs share `PromptFields` — one control for a single value, a spreadsheet grid for several, with the Enter/↓/↑ keys. Do not fork it; the keyboard behaviour only stays consistent because there is one copy.

**`PromptFields` must not depend on the identity of its `fields` array.** Callers build it inline, so a new array arrives on every render; keying the focus effect on it refocused and re-selected after every keystroke, and the next character replaced what had been typed. It keys on a string built from the rows instead.

### Typing arguments with JSDoc

A parameter's type comes from an ordinary JSDoc block above the declaration:

```js
/**
 * @param {string} dni
 * @param {number} monto
 * @param {object} filtros
 */
function cobrar(dni, monto, filtros) { … }
```

It is **valid JavaScript** — comments the engine ignores — so there is no transpiling and no syntax the engine would reject. TC39's type annotations are Stage 1 and QuickJS would refuse `dni: string` outright; TypeScript would mean shipping a compiler and, worse, running something other than what was typed, which is what today keeps error line numbers honest.

`script_signature.rs` reads it: `jsdoc_before()` finds the block attached to the exported declaration (searching the raw source backwards, since `CodeScan` skips comments on purpose) and `jsdoc_param_types()` pulls the `@param` types out. The **declaration stays the authority** on which parameters exist and in what order — JSDoc only adds a type to one already there, so a stale `@param` for a renamed parameter is ignored rather than inventing an argument.

Only a closed set is understood: `string`, `number`, `boolean`, `object`, `array` (plus the spellings people actually write — `Boolean`, `int`, `String[]`, `Array<number>`, `{{ x: string }}`). Anything else reads as **no annotation at all**, because pretending to understand `{Promise<Foo>}` is worse than admitting it says nothing this app can act on.

**A blank field means `undefined`, and JSON cannot say that.** `runScript` sends blanks as `null` plus an `undefined_args` list of positions, and the engine puts the `undefined` back before calling. Without it a parameter written with a default (`function f(a = 10)`) would receive `null`, which does **not** trigger the default — the function would silently compute with nothing. The declaration's defaults are read by the scanner too and shown as the field's placeholder, so leaving it blank is a visible option rather than something to know.

The type picks the control — number field, checkbox, JSON box, plain text — and `coerceArgument()` turns the typed text into the value. **An unannotated argument stays a string; nothing is inferred.** "Looks like JSON, must be JSON" would silently turn a DNI into a number with no way to say otherwise, which is the same class of bug that makes spreadsheets mangle phone numbers. A blank typed field is `undefined` rather than `0` or `{}`, so `function f(monto = 10)` gets its default. A JSON box that will not parse blocks Run in the prompt rather than failing after the fact.

Scripts do **not** run in the webview. `src-tauri/src/script.rs` embeds QuickJS and the `run_script` command evaluates them there. Two reasons, and both are load-bearing:

- **A webview script cannot be stopped.** `new Function` on the main thread means one `while(true)` hangs the app with no way out. QuickJS has an interrupt handler, so `scriptTimeoutSecs` and the user's Cancel both actually work — they share the request cancellation registry (`cancel_request` / `is_cancelled`), so one id cancels either kind of run.
- **Tauri ships no engine of its own.** In the webview a script would run on V8 on Windows and on two different JavaScriptCore versions on macOS and Linux — where the version depends on the distro's webkit2gtk. Embedding the engine is what makes a script behave the same everywhere.

What a script sees, all built by the JS prelude in `script.rs`:

| In scope | Is |
|---|---|
| `response` | the response, JSON bodies already parsed — `null` when there is none |
| `env` | a `Proxy`: reads a snapshot of the effective variables, writes buffer into `__envWrites` |
| `lib` | a `Proxy` compiling each function on first use with `new Function(...params, code)` |
| `args` | the entry script's arguments |
| `console` | `log`/`warn`/`error`, emitted live on `restpilot:script-log` **and** returned in the outcome |

Things that will bite if they are undone:

- **`env.x = undefined` clears the variable**, the same as `delete env.x` — `undefined` is JavaScript for "there is no such thing". A `null` is kept as an empty value instead, because that is a value an API actually returned.
- **A run that clears several variables at once asks first** (`CONFIRM_CLEARED_FROM` in `run-script.ts`). Deleting a token or two is ordinary; a loop over `Object.keys(env)` wiping an environment is not, and by then it is gone. Answering no applies **nothing** — not the deletions and not the run's other writes — so the environment is left exactly as the script found it. Note there is no way to wipe the environment wholesale: `env = {}` only reassigns a local binding, and the only things ever applied are the names the `Proxy` traps recorded.
- **`env` writes are applied by the caller, never by the engine**, and a script that throws applies **none** of them. Half-written variables are impossible to debug. `applyScriptWrites()` puts them in the active environment, or globals when there is none — the same destination an extractor's target variable uses.
- **`lib` needs no cycle guard.** An entry is compiled by evaluating its source and taking the function it declares; compiling does not run the body, so a function calling another one resolves lazily at call time and cannot recurse at definition time.
- **The entry wrapper carries no newline** (`wrap_entry`). That is what makes the line numbers in an error match the lines the user wrote; add one and every reported line is off by one.
- **The library is stored under `helpers`, never `functions`.** The `functions` key belongs to the removed Functions section and is still read by `legacyFunctionExtractors()`; reusing it would silently turn library functions into extractors.
- Two entries declaring the **same function name** is the one name rule left (`helperNameProblem`); everything else about the name is JavaScript's problem and the engine already reported it.
- `FunctionsDialog` runs the **unsaved draft**, not the stored version — it passes its own library through `runScript({ helpers })`.

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

- User preferences live in `AppConfig.settings` (theme, language, proxy, editor and tab behaviour).
- Proxy modes: `none`, `system`, `manual`. Default: `none`.

Auto-mapping a function result to a variable is **per function**, not a user preference — see [Functions](#functions).

### Open-tab limit and the tab strip

Off by default. `settings.limitOpenTabs` plus `settings.maxOpenTabs` (default 5, clamped 1-50 by
`clampMaxOpenTabs()`) cap how many tabs the strip holds. Past the cap, `enforceOpenTabLimit()`
(`src/react/lib/tab-actions.ts`) drops the least recently used ones. **Only the tab closes** — the
request stays in the collection with its saved responses; this is the same path as closing a tab by
hand, never a delete.

- Ranking lives in `src/app/tab-usage.ts`: a runtime-only LRU, `markTabUsed()` on every activation.
  It is deliberately **not** persisted, so a restored session ranks everything 0 and
  `planTabLimitEviction()` (`src/app/open-tabs.ts`) falls back to strip position — leftmost, i.e.
  oldest, leaves first.
- The active tab and the tab being opened are never evicted, so the plan can be shorter than the
  overflow.
- Enforced when a tab opens (permanent or preview), at boot after the config restore, and on every
  change to either setting in Settings → Editor → Tabs.

**The strip does not scroll itself.** An overflow container has no idea which tab is active, so
`scrollActiveTabIntoView()` (`src/ui/tabs-bar.ts`) is what keeps the active tab on screen when it
changes from the tree, a shortcut, or a closed neighbour. `useTabReorder` calls it after each tab
render. It runs **two passes**: revealing a scroll arrow takes 26 px off the viewport and can put the
tab it just scrolled to back under that arrow.

**The active-tab indicator is `.request-tab.active::after`** — a 2 px accent bar along the whole top
edge, over the workspace surface and a faint accent wash (VS Code). Both the bar and the background
are written with `!important` in the overrides block near the end of `styles.css`; change them there,
not by adding a fourth layer. Do not bold the active label: re-measuring the tab nudges every tab to
its right on each switch.

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
- **PDF and image responses render in the webview itself** (`PdfBodyView` / `ImageBodyView` in `ResponsePanel.tsx`): the bytes go into a `Blob` and the resulting `blob:` URL into an `<iframe>` or an `<img>`, so no viewer library is bundled and the release binary is unchanged. Both go through `useResponseObjectUrl()`, which revokes the URL in its effect cleanup — one blob per rendered response, never leak them. `isPdfResponse()` / `isImageResponse()` (`src/lib/response-binary.ts`) accept the matching content types **or** a file signature, so a server answering `application/octet-stream` still previews. `image/svg+xml` is deliberately **not** previewed as a picture: it is UTF-8 text and the XML source is what the response viewer should show.
- **Any response body can be written to disk** with `downloadResponseBody()` (`src/ui/response-panel.ts`): `responseBodyBytes()` turns a text *or* base64 body back into the exact bytes, `suggestedResponseFileName()` picks the name (`Content-Disposition`, else `response.<ext>` from the content type). Saving needs `fs:allow-write-file` in `src-tauri/capabilities/default.json`; the path itself is scoped at runtime by the save dialog.
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
- **cURL parsing** (`src/lib/curl.ts`) reads a command the way a shell does. `tokenizeCurl()` splits *and* unescapes in one pass — single quotes are literal, double quotes drop the backslash in front of a quote, adjacent quoted runs concatenate — so `-d "{\"a\":1}"` imports as a real JSON body. Never strip quotes off a token afterwards; that was the old shape and it left the backslashes in the body. The one rule the shells disagree on is `\\` (POSIX collapses it, cmd.exe/PowerShell do not), so `detectShellStyle()` picks the rule from the markers a generated command carries — `curl.exe`, or a `^`/`` ` `` line continuation. Accepted program words: `curl`, `curl.exe`, and either one reached through a path. Options RestPilot does not model but that take a value belong in `SKIPPED_VALUE_FLAGS`, otherwise their value is imported as the URL.
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
