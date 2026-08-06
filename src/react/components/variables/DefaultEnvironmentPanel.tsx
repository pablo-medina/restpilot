import { t } from "../../../i18n";
import { scheduleSave } from "../../../app/persistence";
import { setState, state } from "../../../app/state";

export function DefaultEnvironmentPanel({ refresh, onVariablesChanged }: { refresh: () => void; onVariablesChanged?: () => void }) {
  const labels = t().environments;
  const isSelectedActive = state.activeEnvironmentId === null;

  const activate = () => {
    setState(prev => ({ ...prev, activeEnvironmentId: null }));
    scheduleSave();
    onVariablesChanged?.();
    refresh();
  };

  return (
    <div className="variables-panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 0 }}>
      <header
        className="env-manage-toolbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          borderBottom: "1px solid var(--rp-border)",
          padding: "8px 12px",
          background: "var(--rp-chrome)",
          minHeight: "45px",
          boxSizing: "border-box"
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--rp-text)" }}>
          {labels.defaultEnvironment || "Default (No environment)"}
        </span>
        {isSelectedActive ? (
          <span
            className="env-status-badge active"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--rp-success)",
              background: "rgb(var(--rp-success-rgb) / 0.1)",
              padding: "4px 10px",
              borderRadius: "20px",
              border: "1px solid rgb(var(--rp-success-rgb) / 0.2)",
              height: "24px",
              boxSizing: "border-box",
              textTransform: "uppercase",
              letterSpacing: "0.03em"
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--rp-success)",
                boxShadow: "0 0 6px rgb(var(--rp-success-rgb) / 0.8)"
              }}
            />
            {labels.active || "Active"}
          </span>
        ) : (
          <button
            className="segmented-btn env-activate-btn"
            type="button"
            style={{
              padding: "0 10px",
              fontSize: "11px",
              borderRadius: "20px",
              border: "1px solid var(--rp-border)",
              background: "var(--rp-surface)",
              color: "var(--rp-text)",
              cursor: "pointer",
              fontWeight: 600,
              height: "24px",
              boxSizing: "border-box"
            }}
            onClick={activate}
          >
            {labels.activate || "Set as active"}
          </button>
        )}
      </header>
      <div
        className="env-editor default-env-editor"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 32px",
          textAlign: "center",
          color: "var(--rp-text-muted)",
          background: "var(--rp-surface)"
        }}
      >
        <div style={{ fontSize: "42px", marginBottom: "16px", opacity: 0.6 }}>🌐</div>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--rp-text)", margin: "0 0 8px 0" }}>
          {labels.defaultEnvironment || "Default (No environment)"}
        </h3>
        <p style={{ fontSize: "12px", maxWidth: "340px", lineHeight: 1.6, margin: 0 }}>
          {labels.defaultEnvDesc ||
            "This is the basic global scope. No environment-specific variables are active. Requests will use only the global variables defined on the left."}
        </p>
      </div>
    </div>
  );
}
