import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getActiveEnvironment, getEffectiveVariables } from "../../app/environments";
import { scheduleSave } from "../../app/persistence";
import { id, state } from "../../app/state";
import { applicationDialog } from "../../components/dialogs";
import { t } from "../../i18n";
import { applyHelperVariable, type HelperSignature } from "../../lib/helpers";
import type { Helper } from "../../types";

const SCRIPT_LOG_EVENT = "restpilot:script-log";

export type ScriptLogLevel = "log" | "warn" | "error";
export type ScriptLogLine = { level: ScriptLogLevel; text: string };
/** `value: null` means the script deleted the variable. */
export type ScriptEnvWrite = { name: string; value: string | null };

export type ScriptOutcome = {
  /** JSON of the returned value; `null` when the script returned nothing. */
  value: string | null;
  writes: ScriptEnvWrite[];
  logs: ScriptLogLine[];
  error: string | null;
  duration_ms: number;
};

type ScriptLogEvent = { run_id: string; level: ScriptLogLevel; text: string };

export type RunScriptOptions = {
  /** Body of the entry function. `response`, `env`, `lib` and `args` are in scope. */
  code: string;
  /** Cancellable handle; pass one to be able to stop the run. */
  runId: string;
  args?: unknown[];
  response?: unknown;
  /** Called as each `console.*` line arrives, while the script is still running. */
  onLog?: (line: ScriptLogLine) => void;
  /** Library to run against. Defaults to what is stored; the editor passes its unsaved draft
   * so Run tests what is on screen. */
  helpers?: readonly Helper[];
};

/**
 * Runs a script in the embedded engine. Never throws for a script's own mistakes — those come
 * back as `outcome.error`; a rejection means the command itself could not run.
 *
 * The whole library ships with every run: functions are resolved lazily inside the engine, so
 * an unused one costs a JSON entry and nothing more.
 */
export async function runScript(options: RunScriptOptions): Promise<ScriptOutcome> {
  let unlisten: UnlistenFn | undefined;
  if (options.onLog) {
    const onLog = options.onLog;
    unlisten = await listen<ScriptLogEvent>(SCRIPT_LOG_EVENT, (event) => {
      if (event.payload.run_id !== options.runId) return;
      onLog({ level: event.payload.level, text: event.payload.text });
    });
  }

  try {
    return await invoke<ScriptOutcome>("run_script", {
      payload: {
        run_id: options.runId,
        code: options.code,
        args: (options.args ?? []).map((value) => (value === undefined ? null : value)),
        // JSON has no `undefined`, and the difference decides whether a parameter written with
        // a default gets it. The positions travel separately and the engine restores them.
        undefined_args: (options.args ?? []).flatMap((value, index) =>
          value === undefined ? [index] : []
        ),
        response: options.response ?? null,
        timeout_ms: state.settings.scriptTimeoutSecs * 1000,
        // Only the source travels: the engine reads each entry's name back out of it, so a
        // stale cached name here cannot make `lib.<name>` resolve to the wrong function.
        helpers: (options.helpers ?? state.helpers).map((helper) => ({ code: helper.code })),
        variables: getEffectiveVariables()
          .filter((variable) => variable.enabled && variable.name.trim())
          .map((variable) => ({ name: variable.name.trim(), value: variable.value }))
      }
    });
  } finally {
    unlisten?.();
  }
}

/**
 * Reads back the name and parameters an entry's source declares.
 *
 * Cheap enough to call while the editor is being typed in — it scans and compiles, it does not
 * run anything — but debounce it anyway; there is no reason to parse every keystroke.
 */
export async function parseScript(code: string): Promise<HelperSignature> {
  return await invoke<HelperSignature>("parse_script", { payload: { code } });
}

/** Stops a run started with `runId`. Scripts share the request cancellation registry. */
export async function cancelScript(runId: string): Promise<void> {
  await invoke("cancel_request", { id: runId });
}

/** How many variables one run may clear before it has to ask.
 *
 * A script clearing a token it just used is ordinary; a loop over `Object.keys(env)` wiping an
 * environment is not, and by then the variables are gone. Set high enough that deliberate
 * cleanup of a credential or two goes through without a dialog. */
const CONFIRM_CLEARED_FROM = 3;

export type AppliedWrites = { applied: string[]; cancelled: boolean };

/**
 * Writes what the script put in `env` into the active environment, or globals when there is
 * none — the same destination a request's target variable uses.
 *
 * Applied in order, so the last write to a name wins. A run that clears several variables at
 * once asks first, and nothing is applied if the answer is no — not the deletions and not the
 * other writes either, so the environment is left exactly as the script found it.
 */
export async function applyScriptWrites(writes: ScriptEnvWrite[]): Promise<AppliedWrites> {
  const named = writes.filter((write) => write.name.trim() !== "");
  if (named.length === 0) return { applied: [], cancelled: false };

  const environment = getActiveEnvironment();
  const list = environment ? environment.variables : state.variables;

  const cleared = named
    .filter((write) => write.value === null)
    .map((write) => write.name.trim())
    .filter((name) => list.some((variable) => variable.name.trim() === name));

  if (cleared.length >= CONFIRM_CLEARED_FROM) {
    const labels = t().functions;
    const dialogLabels = t().dialog;
    const answer = await applicationDialog({
      title: labels.clearTitle,
      body: labels.clearBody
        .replace("{count}", String(cleared.length))
        .replace("{names}", cleared.join(", ")),
      resizable: false,
      width: 420,
      height: 0,
      actions: [
        { id: "no", label: dialogLabels.no },
        { id: "yes", label: dialogLabels.yes, role: "danger" }
      ]
    });
    if (answer !== "yes") return { applied: [], cancelled: true };
  }

  const touched: string[] = [];
  for (const write of named) {
    const name = write.name.trim();
    if (write.value === null) {
      const at = list.findIndex((variable) => variable.name.trim() === name);
      if (at >= 0) list.splice(at, 1);
    } else {
      applyHelperVariable(list, name, write.value, id);
    }
    if (!touched.includes(name)) touched.push(name);
  }

  scheduleSave();
  return { applied: touched, cancelled: false };
}
