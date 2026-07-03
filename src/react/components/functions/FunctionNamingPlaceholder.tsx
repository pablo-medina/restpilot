import { iconRename } from "../../../lib/icons";
import { t } from "../../../i18n";

export function FunctionNamingPlaceholder() {
  const labels = t().functions;

  return (
    <div
      className="empty-editor"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        gap: 16,
        padding: 32,
        border: "1px dashed var(--rp-border)",
        borderRadius: "var(--rp-radius)",
        margin: 24,
        height: "calc(100% - 48px)"
      }}
    >
      <div
        className="function-naming-icon"
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(46, 204, 113, 0.1), rgba(52, 152, 219, 0.1))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1.5px solid var(--rp-border)",
          color: "var(--rp-accent)"
        }}
        dangerouslySetInnerHTML={{ __html: iconRename }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 320 }}>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--rp-text)",
            margin: 0,
            background: "linear-gradient(120deg, var(--rp-text), var(--rp-accent, #3d7f6f))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}
        >
          {labels.namingPlaceholderTitle}
        </h3>
        <p
          className="hint"
          style={{ fontSize: 12.5, color: "var(--rp-text-muted)", lineHeight: 1.5, margin: 0 }}
          dangerouslySetInnerHTML={{ __html: labels.namingPlaceholderDesc }}
        />
      </div>
    </div>
  );
}
