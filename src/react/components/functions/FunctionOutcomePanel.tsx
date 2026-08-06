import { t } from "../../../i18n";
import type { ApiResponse } from "../../../types";

type TestResult = {
  success: boolean;
  extractedValue?: unknown;
  error?: string;
} | null | undefined;

type Props =
  | {
      variant: "http";
      loading: boolean;
      response: ApiResponse | null | undefined;
    }
  | {
      variant: "extract";
      loading: boolean;
      result: TestResult;
    };

function formatExtractedValue(value: unknown): string {
  try {
    return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  } catch {
    return String(value);
  }
}

export function FunctionOutcomePanel(props: Props) {
  const funcLabels = t().functions;

  if (props.variant === "http") {
    if (props.loading) {
      return (
        <div
          className="flex flex-col items-center justify-center flex-1"
          style={{
            color: "var(--rp-text-muted)",
            fontSize: 13,
            height: 180,
            minHeight: 180,
            border: "1px solid var(--rp-border)",
            borderRadius: "var(--rp-radius)",
            background: "var(--rp-surface)"
          }}
        >
          <span
            className="send-icon-spin"
            style={{
              marginBottom: 8,
              width: 16,
              height: 16,
              border: "2px solid var(--rp-text-muted)",
              borderRightColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              display: "inline-block"
            }}
          />
          {funcLabels.sending}
        </div>
      );
    }

    if (!props.response) {
      return (
        <div
          className="flex items-center justify-center flex-1"
          style={{
            color: "var(--rp-text-muted)",
            fontSize: 13,
            textAlign: "center",
            padding: 24,
            height: 180,
            minHeight: 180,
            border: "1px dashed var(--rp-border)",
            borderRadius: "var(--rp-radius)",
            background: "var(--rp-surface)"
          }}
        >
          {funcLabels.noHttpResponse}
        </div>
      );
    }

    return (
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{
          padding: 12,
          border: "1px solid var(--rp-border)",
          borderRadius: "var(--rp-radius)",
          background: "var(--rp-surface)",
          fontFamily: "monospace",
          fontSize: 13,
          overflowY: "auto",
          textAlign: "left",
          height: 180,
          minHeight: 180
        }}
      >
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--rp-text-muted)" }}>
          {props.response.body || ""}
        </pre>
      </div>
    );
  }

  if (props.loading) {
    return (
      <div
        className="flex flex-col items-center justify-center flex-1"
        style={{
          color: "var(--rp-text-muted)",
          fontSize: 13,
          height: 180,
          minHeight: 180,
          border: "1px solid var(--rp-border)",
          borderRadius: "var(--rp-radius)",
          background: "var(--rp-surface)"
        }}
      >
        <span
          className="send-icon-spin"
          style={{
            marginBottom: 8,
            width: 16,
            height: 16,
            border: "2px solid var(--rp-text-muted)",
            borderRightColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            display: "inline-block"
          }}
        />
        {funcLabels.testing}
      </div>
    );
  }

  if (!props.result) {
    return (
      <div
        className="flex items-center justify-center flex-1"
        style={{
          color: "var(--rp-text-muted)",
          fontSize: 13,
          textAlign: "center",
          padding: 24,
          height: 180,
          minHeight: 180,
          border: "1px dashed var(--rp-border)",
          borderRadius: "var(--rp-radius)",
          background: "var(--rp-surface)"
        }}
      >
        {funcLabels.emptyTestResult}
      </div>
    );
  }

  if (props.result.success) {
    const formattedVal = formatExtractedValue(props.result.extractedValue);
    return (
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{
          padding: 12,
          border: "1px solid var(--rp-border)",
          borderRadius: "var(--rp-radius)",
          background: "var(--rp-surface)",
          fontFamily: "monospace",
          fontSize: 13,
          overflowY: "auto",
          textAlign: "left",
          height: 180,
          minHeight: 180
        }}
      >
        <div style={{ marginBottom: 8, fontWeight: 600, color: "var(--rp-success)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--rp-success)" }} />
          {funcLabels.success}
        </div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--rp-text)" }}>{formattedVal}</pre>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      style={{
        padding: 12,
        border: "1px solid #b54a3a33",
        borderRadius: "var(--rp-radius)",
        background: "#b54a3a0a",
        fontFamily: "monospace",
        fontSize: 13,
        overflowY: "auto",
        textAlign: "left",
        height: 180,
        minHeight: 180
      }}
    >
      <div style={{ marginBottom: 8, fontWeight: 600, color: "var(--rp-danger-text)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--rp-danger-text)" }} />
        {funcLabels.failure}
      </div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--rp-danger-text)" }}>{props.result.error || "Unknown error occurred."}</pre>
    </div>
  );
}
