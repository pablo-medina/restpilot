import { useEffect, useRef } from "react";
import { t } from "../../../i18n";
import type { ScriptLogLine, ScriptOutcome } from "../../lib/run-script";

type Props = {
  outcome: ScriptOutcome | null;
  /** Lines as they arrive; once the run finishes these are the outcome's own. */
  logs: ScriptLogLine[];
};

/** What a run produced: the returned value or the error, the console, and how long it took.
 *
 * Shared by the editor and the result dialog so a run started from the picker reads exactly
 * like one started from the editor. */
export function ScriptOutput({ outcome, logs }: Props) {
  const labels = t().functions;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [outcome, logs]);

  if (!outcome && logs.length === 0) return null;

  return (
    <div className="functions-output" ref={scrollRef}>
      {outcome?.error ? (
        <pre className="script-output is-error functions-output-value">{outcome.error}</pre>
      ) : outcome ? (
        <pre className="script-output functions-output-value">
          {outcome.value ?? labels.noValue}
        </pre>
      ) : null}

      {logs.length > 0 ? (
        <div className="functions-console" role="log" aria-label={labels.console}>
          {logs.map((line, index) => (
            <p key={index} className={`functions-console-line is-${line.level}`}>
              {line.text}
            </p>
          ))}
        </div>
      ) : null}

      {outcome && !outcome.error ? (
        <p className="functions-output-meta">
          {labels.duration.replace("{ms}", String(outcome.duration_ms))}
        </p>
      ) : null}
    </div>
  );
}
