import { t } from "../../i18n";
import {
  coerceArgument,
  helperCallArgs,
  helperCallCode,
  parseSampleResponse,
  typedSignatureText
} from "../../lib/helpers";
import type { Helper } from "../../types";
import { pushToast } from "../components/Toast";
import {
  applyScriptWrites,
  parseScript,
  runScript,
  type ScriptLogLine,
  type ScriptOutcome
} from "./run-script";
import { promptForScriptArgs } from "./script-args-prompt";

export type RunHelperOptions = {
  /** The function to run. Pass the editor's unsaved draft to run what is on screen. */
  helper: Helper;
  /** Library the call resolves against; defaults to what is stored. */
  library?: readonly Helper[];
  /** A response to hand the first parameter instead of asking for it. */
  sample?: string | null;
  /** Called once the run has a cancellable id. */
  onStart?: (runId: string) => void;
  /** Called as each `console.*` line arrives, while the script is still running. */
  onLog?: (line: ScriptLogLine) => void;
  /** Called with the arguments the prompt collected, so an editor can remember them. */
  onArgs?: (args: string[]) => void;
};

/** `null` means the run never started: the argument prompt was cancelled. */
export type RunHelperResult = ScriptOutcome | null;

function failed(error: string): ScriptOutcome {
  return { value: null, writes: [], logs: [], error, duration_ms: 0 };
}

/**
 * Runs one library function: works out its signature, asks for whatever it needs, runs it and
 * applies what it wrote to `env`.
 *
 * Everything a run involves lives here rather than in the editor, because a run started from
 * the picker never opens one.
 */
export async function runHelper(options: RunHelperOptions): Promise<RunHelperResult> {
  const labels = t().functions;
  const source = options.helper.code;

  const signature = await parseScript(source).catch((error: unknown) => ({
    name: null,
    params: [],
    error: error instanceof Error ? error.message : String(error)
  }));

  if (!signature.name) {
    return failed(signature.error === "no-function" ? labels.noFunction : signature.error ?? "");
  }
  if (signature.error) return failed(signature.error);

  const name = signature.name;
  const params = signature.params;

  // With a sample the first parameter is the response, so it is injected rather than asked for.
  const injects = options.sample != null && params.length > 0;
  const asked = injects ? params.slice(1) : params;

  let injected: unknown = null;
  if (injects) {
    const parsed = parseSampleResponse(options.sample ?? "");
    if (!parsed.ok) return failed(labels.sampleInvalid);
    injected = parsed.value;
  }

  const askedNames = asked.map((param) => param.name);
  const seedValues = helperCallArgs(askedNames, options.helper.sampleArgs ?? []);
  const seed: Record<string, string> = {};
  askedNames.forEach((param, index) => {
    seed[param] = seedValues[index] ?? "";
  });

  // Nothing left to ask for once the sample fills the only parameter: an empty prompt is a
  // dialog that asks a question with no fields in it.
  const answers =
    asked.length === 0
      ? {}
      : await promptForScriptArgs({
          signature: typedSignatureText(name, params),
          params: asked,
          seed
        });
  if (answers === null) return null;

  const typed = asked.map((param) => answers[param.name] ?? "");
  options.onArgs?.(typed);

  // What the prompt collected is text; the declared type is what turns it into a value.
  const given: unknown[] = [];
  for (const param of asked) {
    const coerced = coerceArgument(answers[param.name] ?? "", param.type);
    if (!coerced.ok) return failed(labels.argInvalid.replace("{names}", param.name));
    given.push(coerced.value);
  }

  const runId = crypto.randomUUID();
  options.onStart?.(runId);

  const outcome = await runScript({
    runId,
    code: helperCallCode(name),
    args: injects ? [injected, ...given] : given,
    helpers: options.library,
    onLog: options.onLog
  }).catch((error: unknown) => failed(error instanceof Error ? error.message : String(error)));

  if (!outcome.error && outcome.writes.length > 0) {
    const { applied, cancelled } = await applyScriptWrites(outcome.writes);
    if (cancelled) pushToast(labels.variablesKept);
    else if (applied.length > 0) {
      pushToast(labels.variablesWritten.replace("{names}", applied.join(", ")));
    }
  }

  return outcome;
}
