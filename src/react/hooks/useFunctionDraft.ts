import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scheduleSave } from "../../app/persistence";
import { setState, state } from "../../app/state";
import { t } from "../../i18n";
import {
  helperNameProblem,
  typedSignatureText,
  type HelperParam,
  type HelperSignature
} from "../../lib/helpers";
import type { LibraryCompletion } from "../../ui/large-text-editor";
import type { Helper } from "../../types";
import { applicationDialog } from "../../components/dialogs";
import { runHelper } from "../lib/run-helper";
import { cancelScript, parseScript, type ScriptLogLine, type ScriptOutcome } from "../lib/run-script";

/** How long typing has to stop before the source is parsed again. */
const PARSE_DEBOUNCE_MS = 350;

/** The parts of a function this editor changes. The rest is derived or bookkeeping. */
export type FunctionDraft = Pick<Helper, "description" | "code" | "sampleArgs">;

export type OpenFunctionDraft = {
  /** The function to edit. Pass one that is not in `state.helpers` to create it on save. */
  helper: Helper;
  /** True when `helper` does not exist yet, so saving appends rather than replaces. */
  creating?: boolean;
  /** A response handed to the first parameter instead of being asked for. */
  sample?: string | null;
};

function toDraft(helper: Helper): FunctionDraft {
  return {
    description: helper.description ?? "",
    code: helper.code,
    sampleArgs: [...(helper.sampleArgs ?? [])]
  };
}

/**
 * Everything editing one library function involves: the draft, the signature the engine reads
 * back out of it, whether it has been changed, running it, and saving or discarding.
 *
 * It lives apart from any one screen because the same editing surface is meant to work in a
 * dialog and in a full panel — the only thing that differs between them is what surrounds it.
 */
export function useFunctionDraft(refresh: () => void) {
  const [open, setOpen] = useState<{ helper: Helper; creating: boolean } | null>(null);
  const [draft, setDraft] = useState<FunctionDraft | null>(null);
  const [signature, setSignature] = useState<HelperSignature | null>(null);
  const [outcome, setOutcome] = useState<ScriptOutcome | null>(null);
  const [logs, setLogs] = useState<ScriptLogLine[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [sample, setSample] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryCompletion[]>([]);
  const sampleRef = useRef<string | null>(null);
  /** What the draft looked like on open, to tell an edited editor from a merely opened one. */
  const initialRef = useRef<FunctionDraft | null>(null);

  const labels = t().functions;
  const dialogLabels = t().dialog;

  const load = useCallback((next: OpenFunctionDraft) => {
    setOpen({ helper: next.helper, creating: next.creating ?? false });
    setDraft(toDraft(next.helper));
    initialRef.current = toDraft(next.helper);
    setSample(next.sample ?? null);
    sampleRef.current = next.sample ?? null;
    setSignature(null);
    setOutcome(null);
    setLogs([]);
    setLibrary([]);
  }, []);

  const clear = useCallback(() => {
    setOpen(null);
    setDraft(null);
    setSignature(null);
    setSample(null);
    sampleRef.current = null;
    initialRef.current = null;
    setOutcome(null);
    setLogs([]);
    setLibrary([]);
  }, []);

  const code = draft?.code;

  // One parse per pause in typing. The engine is the only thing that reads a signature, so the
  // editor asks it rather than keeping a second parser in the frontend.
  useEffect(() => {
    if (code === undefined) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void parseScript(code)
        .then((result) => {
          if (!cancelled) setSignature(result);
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setSignature({
              name: null,
              params: [],
              error: error instanceof Error ? error.message : String(error)
            });
          }
        });
    }, PARSE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code]);

  const helper = open?.helper ?? null;
  const creating = open?.creating ?? false;
  const openedId = helper?.id ?? null;

  /**
   * Signatures of the *other* functions, for the editor's `lib.` completions.
   *
   * Read from each entry's own source rather than from the cached `params`, because the cache
   * holds names only and the point here is to show the types too. One parse per entry, once
   * when the editor opens — off the typing path, and always in step with the source.
   *
   * The function being edited is left out: calling itself would recurse, and the list should
   * not suggest it.
   */
  useEffect(() => {
    if (!openedId) return;
    const others = state.helpers.filter((item) => item.id !== openedId);
    let cancelled = false;

    void Promise.all(
      others.map((item) =>
        parseScript(item.code)
          .then((parsed) => ({ item, parsed }))
          .catch(() => ({ item, parsed: null }))
      )
    ).then((results) => {
      if (cancelled) return;
      setLibrary(
        results.flatMap(({ item, parsed }) => {
          const entryName = parsed?.name ?? item.name;
          if (!entryName) return [];
          const entryParams = parsed?.params ?? item.params.map((name) => ({ name, type: null }));
          return [
            {
              name: entryName,
              signature: typedSignatureText("", entryParams),
              takesArguments: entryParams.length > 0
            }
          ];
        })
      );
    });

    return () => {
      cancelled = true;
    };
  }, [openedId]);
  const name = signature?.name ?? "";
  const params = useMemo<HelperParam[]>(() => signature?.params ?? [], [signature]);

  const duplicate = useMemo(
    () =>
      helper && name ? helperNameProblem(name, state.helpers, helper.id) === "duplicate" : false,
    [name, helper]
  );

  const runnable = Boolean(name) && !signature?.error && !duplicate;

  // Only what gets stored counts as a change. The sample pane is scaffolding, and `sampleArgs`
  // is bookkeeping a run updates on its own — asking to confirm a discard after merely running
  // something would be noise.
  const initial = initialRef.current;
  const edited =
    Boolean(draft && initial) &&
    (draft?.code !== initial?.code ||
      (draft?.description ?? "") !== (initial?.description ?? ""));

  const patch = useCallback(
    (change: Partial<FunctionDraft>) =>
      setDraft((prev) => (prev ? { ...prev, ...change } : prev)),
    []
  );

  const editSample = useCallback((value: string) => {
    setSample(value);
    sampleRef.current = value;
  }, []);



  const run = async () => {
    if (!helper || !draft) return;
    setOutcome(null);
    setLogs([]);

    // A function being created is not in `state.helpers` at all — it is only stored on save —
    // so it has to be added rather than substituted, or `lib.<name>` would not resolve.
    const current = { ...helper, ...draft };
    const runLibrary = creating
      ? [...state.helpers, current]
      : state.helpers.map((item) => (item.id === helper.id ? current : item));

    const result = await runHelper({
      helper: current,
      library: runLibrary,
      sample: sampleRef.current,
      onStart: setRunId,
      onLog: (line) => setLogs((prev) => [...prev, line]),
      onArgs: (args) => patch({ sampleArgs: args })
    });

    setRunId(null);
    if (!result) return;
    setOutcome(result);
    // The live stream and the returned list are the same lines; take the returned one as final.
    setLogs(result.logs);
    refresh();
  };

  const stop = () => {
    if (runId) void cancelScript(runId);
  };

  /**
   * Writes the draft into the library and stays on it. Returns whether anything was saved.
   *
   * Closing afterwards is the frame's call: coming from a request you are done, browsing the
   * library you are not.
   */
  const save = (): boolean => {
    if (!helper || !draft || !runnable || !edited) return false;
    const saved: Helper = {
      ...helper,
      name,
      params: params.map((param) => param.name),
      description: draft.description?.trim() || undefined,
      code: draft.code,
      sampleArgs: draft.sampleArgs?.length ? draft.sampleArgs : undefined
    };
    setState((prev) => ({
      ...prev,
      helpers: creating
        ? [...prev.helpers, saved]
        : prev.helpers.map((item) => (item.id === helper.id ? saved : item))
    }));
    scheduleSave();
    // Now stored, so a second save must replace rather than append a duplicate, and the
    // editor is no longer "edited" against what is on disk.
    setOpen({ helper: saved, creating: false });
    initialRef.current = toDraft(saved);
    setDraft(toDraft(saved));
    refresh();
    return true;
  };

  /**
   * Runs `proceed` unless the draft has unsaved changes the user decides to keep.
   *
   * The one guard for every way out — cancelling, closing, and later switching to another
   * function in a panel's list — so those cannot drift apart.
   */
  const guard = useCallback(
    async (proceed: () => void) => {
      if (!edited) {
        proceed();
        return;
      }
      // Yes/No rather than Confirm/Cancel: on a "discard your changes?" prompt, a button
      // labelled Cancel reads as cancelling the edit, which is the opposite of what it does.
      const answer = await applicationDialog({
        title: labels.discardTitle,
        body: labels.discardBody,
        resizable: false,
        width: 400,
        height: 0,
        actions: [
          { id: "no", label: dialogLabels.no },
          { id: "yes", label: dialogLabels.yes, role: "danger" }
        ]
      });
      if (answer === "yes") proceed();
    },
    [edited, labels.discardTitle, labels.discardBody, dialogLabels.no, dialogLabels.yes]
  );

  return {
    helper,
    creating,
    draft,
    signature,
    name,
    params,
    duplicate,
    runnable,
    edited,
    sample,
    library,
    outcome,
    logs,
    running: runId !== null,
    load,
    clear,
    patch,
    editSample,
    run,
    stop,
    save,
    guard
  };
}

export type FunctionDraftState = ReturnType<typeof useFunctionDraft>;
