import { t } from "../../../i18n";
import { CodeMirrorEditor } from "../CodeMirrorEditor";
import { AppModal } from "./AppModal";

type Props = { onClose: () => void };

/** The example is the same in every language — it is JavaScript, not prose — so it lives here
 * rather than in the translation files. */
const EXAMPLE = `/**
 * @param {object} response
 * @param {number} minStatus
 */
function saveToken(response, minStatus = 200) {
  if (response.status < minStatus) return null;

  ui.showToast({ title: "Sesión", message: "token para " + response.body.user });
  env.APP_TOKEN = response.body.token;
  env.LAST_USER = undefined;

  return response.body.token;
}
`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="script-help-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Entry({ term, text }: { term: string; text: string }) {
  return (
    <p className="script-help-entry">
      <code>{term}</code>
      <span>{text}</span>
    </p>
  );
}

/** A short reference for what a library function can do: what is in scope, how arguments are
 * typed, and where the edges are. Opened from the editor, over it. */
export function ScriptHelpDialog({ onClose }: Props) {
  const labels = t().functions.help;
  const dialogLabels = t().dialog;

  return (
    <AppModal
      open
      variant="script-help"
      title={labels.title}
      width={620}
      height={620}
      onClose={onClose}
      footer={
        <button className="primary" type="button" data-dialog-primary="true" onClick={onClose}>
          {dialogLabels.close}
        </button>
      }
    >
      <div className="script-help-body">
        <p className="script-help-intro">{labels.intro}</p>

        <Section title={labels.scopeTitle}>
          <Entry term="lib.name(…)" text={labels.scopeLib} />
          <Entry term="env.NAME" text={labels.scopeEnv} />
          <Entry term="env.NAME = undefined" text={labels.scopeEnvClear} />
          <Entry term="response" text={labels.scopeResponse} />
          <Entry term="console.log(…)" text={labels.scopeConsole} />
          <Entry term="ui.showToast(…)" text={labels.scopeUi} />
        </Section>

        <Section title={labels.typesTitle}>
          <p>{labels.typesIntro}</p>
          <Entry term="string · number · boolean · object · array" text={labels.typesKnown} />
          <p>{labels.typesDefault}</p>
        </Section>

        <Section title={labels.limitsTitle}>
          <p>{labels.limitsEngine}</p>
          <p>{labels.limitsTimeout}</p>
          <p>{labels.limitsWrites}</p>
        </Section>

        <Section title={labels.exampleTitle}>
          <div className="script-help-example">
            <CodeMirrorEditor readOnly language="javascript" value={EXAMPLE} />
          </div>
        </Section>
      </div>
    </AppModal>
  );
}
