import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../../i18n";

type Props = {
  children: ReactNode;
  /** Short human-readable name of the section wrapped, used in the fallback message and logs. */
  label?: string;
};

type State = {
  error: Error | null;
};

/**
 * Catches render errors in its subtree so a single broken component doesn't take down
 * the whole app (React unmounts everything on an uncaught render error otherwise).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[RestPilot] Render error${this.props.label ? ` in "${this.props.label}"` : ""}:`, error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const labels = t().errorBoundary;
    const title = this.props.label ? labels.titleIn.replace("{label}", this.props.label) : labels.title;

    return (
      <div className="error-boundary-fallback" role="alert">
        <p className="error-boundary-message">{title}</p>
        <div className="error-boundary-actions">
          <button type="button" className="error-boundary-btn" onClick={this.reset}>
            {labels.retry}
          </button>
          <button type="button" className="error-boundary-btn" onClick={() => window.location.reload()}>
            {labels.reload}
          </button>
        </div>
        <details className="error-boundary-details">
          <summary>{labels.details}</summary>
          <pre>{error.message}</pre>
        </details>
      </div>
    );
  }
}
