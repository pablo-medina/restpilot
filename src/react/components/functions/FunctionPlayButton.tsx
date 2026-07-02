import { iconPlay } from "../../../lib/icons";
import { t } from "../../../i18n";

type Props = {
  loading: boolean;
  onClick: () => void;
};

export function FunctionPlayButton({ loading, onClick }: Props) {
  return (
    <button
      className={`quiet-button${loading ? " is-loading" : ""}`}
      type="button"
      title={t().functions.testFunction}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "#2ecc71",
        padding: 4,
        borderRadius: 4,
        transition: "background 0.2s",
        minWidth: "unset",
        height: 28,
        width: 28
      }}
      onClick={onClick}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = "rgba(46, 204, 113, 0.1)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
    >
      {loading ? (
        <span
          className="send-icon-spin"
          style={{
            display: "inline-block",
            width: 14,
            height: 14,
            border: "2px solid currentColor",
            borderRightColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite"
          }}
        />
      ) : (
        <span className="function-play-icon" style={{ display: "grid" }} dangerouslySetInnerHTML={{ __html: iconPlay }} />
      )}
    </button>
  );
}
