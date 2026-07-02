import { useState } from "react";
import { iconEye, iconEyeOff } from "../../lib/icons";
import { t } from "../../i18n";
import { VariableInput } from "./VariableInput";

type Props = {
  id?: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  shellClassName?: string;
  useVariableInput?: boolean;
  onChange: (value: string) => void;
};

export function SecretInput({
  id,
  value,
  placeholder,
  autoComplete = "off",
  disabled,
  shellClassName = "",
  useVariableInput = false,
  onChange
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const labels = t().settings;
  const toggleLabel = revealed ? labels.proxyUrlHide : labels.proxyUrlShow;
  return (
    <div className={`settings-input-shell settings-input-shell--secret auth-secret-field${shellClassName ? ` ${shellClassName}` : ""}`}>
      {useVariableInput ? (
        <VariableInput
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete={autoComplete}
          disabled={disabled}
          onValueChange={onChange}
        />
      ) : (
        <input
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete={autoComplete}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <div className="settings-input-trailing">
        <button
          className="mini-btn settings-secret-toggle"
          type="button"
          title={toggleLabel}
          aria-label={toggleLabel}
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setRevealed((current) => !current);
          }}
          dangerouslySetInnerHTML={{ __html: revealed ? iconEyeOff : iconEye }}
        />
      </div>
    </div>
  );
}
