---
name: add-import-source
description: Add a new collection import source to RestPilot (e.g. Insomnia, HAR, Bruno). Use when asked to support importing from a new tool or file format, alongside the existing RestPilot/Postman/OpenAPI/cURL sources.
---

# Add an import source

RestPilot imports collections from four sources today: its own export format, Postman v2.1,
OpenAPI 3.x/Swagger 2.0 (JSON or YAML), and raw cURL. Both entry points — **Import collection**
(file picker) and **Import from text** (paste + auto-detect) — share one pipeline. Adding a
fifth source means touching the same handful of files; this skill is the checklist.

Read `AGENTS.md` → **Import** and **Dialogs** sections first for the architecture summary.

## Steps

1. **Type.** Add the new value to `ImportSource` in `src/import/types.ts`.

2. **Parser.** Write `src/import/<source>.ts` exporting `parseXxx(raw: string): ImportParseResult`.
   `ImportParseResult` is `{ folders: Folder[]; requests: SavedRequest[]; tree: ImportTreeNode[];
   name: string; description?: string }`. Look at `src/import/postman.ts` or
   `src/import/openapi.ts` for the shape: build `SavedRequest` objects with fresh
   `crypto.randomUUID()` ids, fill in every required field (don't rely on partial objects —
   `SavedRequest` has no optional `method`/`url`/`bodyMode`/etc.), and build a parallel
   `ImportTreeNode` tree for the preview checklist (folders nest, requests carry
   `method`/`url` for the badge). Throw a plain `Error` with a short message on invalid input —
   the caller wraps it into `importParseError`.

3. **Detection.** Add a branch to `detectImportSource()` in `src/import/detect.ts`. This runs on
   **every keystroke** in the "Import from text" textarea, so keep it cheap: a prefix/shape
   check, not a full parse. Order matters — put the cheapest/most specific check first (see how
   `looksLikeCurl` short-circuits before the `JSON.parse` attempt).

4. **Wire it into the pipeline.** In `src/import/source-dialog.ts`:
   - Add a branch in `parseBySource()` calling your new parser.
   - If the source is file-based, add its extension(s)/dialog filter name in `pickFile()`.
   - If it belongs in the source-selection radio list (`showSourceSelection()`), add a
     `<label>`/`<p class="import-src-desc">` pair — cURL's is the reference since it also reveals
     a textarea (`bindDialogPreviewContent`'s `import-source` branch in
     `src/components/dialogs.ts` handles that toggle).

5. **i18n.** Add `importSourceXxx` (display name) and `importSourceXxxDesc` (one-line
   description) to **both** `src/i18n/en.ts` and `src/i18n/es.ts`, under the `collection`
   namespace, next to the existing `importSource*` keys. `importSourceXxx` is reused verbatim as
   the "Detected format: {format}" text in the Import-from-text dialog — keep it short.

6. **Tests.** Add `src/import/<source>.test.ts` covering: a minimal valid document, a malformed
   one (throws), and at least one field mapping you're not 100% sure about (auth, nested
   folders, body encoding). Add a case to `src/import/detect.test.ts` for the new detection
   branch, including one negative case that must **not** match it.

7. **Verify.** `npx tsc --noEmit`, `npm test`, then manually paste a real export from the target
   tool into **Import from text** and confirm: live detection shows the right name, the preview
   dialog lists the expected folders/requests, and the imported request actually runs.

## What you should NOT need to touch

- `src/import/index.ts` (`startImport`/`startImportFromText`) — format-agnostic, already shared.
- `showPreviewDialog()` / `finishImport()` in `source-dialog.ts` — the selection + target-folder
  step is the same for every source.
- Anything in `src/components/dialogs.ts` beyond what step 4 mentions, unless the new source
  needs its own live-validation behavior (rare — most sources don't need more than "does this
  parse").

If the source needs something the pipeline doesn't support yet (e.g. binary attachments, a
multi-file bundle), stop and flag it — that's a pipeline change, not a new-source addition, and
should be scoped separately.
