import { useEffect, useRef } from "react";
import { t } from "../../../i18n";
import { coerceArgument, type ParamType } from "../../../lib/helpers";

/** A row to fill in. `type` is `null` for plain text, which is what request parameters are. */
export type PromptField = { name: string; type: ParamType | null; default?: string | null };

type Props = {
  /** One row per field, in order. */
  fields: PromptField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  /** Enter past the last row runs this. */
  onSubmit: () => void;
};

/** Which fields hold something their type cannot accept. */
export function promptFieldProblems(
  fields: readonly PromptField[],
  values: Record<string, string>
): string[] {
  return fields
    .filter((field) => !coerceArgument(values[field.name] ?? "", field.type).ok)
    .map((field) => field.name);
}

function isMultiline(type: ParamType | null): boolean {
  return type === "object" || type === "array";
}

/**
 * The body shared by every "fill these in and go" dialog: one labelled control for a single
 * value, a spreadsheet grid for several.
 *
 * Keyboard is the point of the grid — Enter and Down commit and step forward, Up steps back,
 * Enter past the last row submits — and it only stays consistent because there is one copy.
 *
 * The control follows the declared type: a number field for `number`, a checkbox for
 * `boolean`, a JSON box for `object` and `array`, plain text for everything else.
 */
export function PromptFields({ fields, values, onChange, onSubmit }: Props) {
  const inputs = useRef<(HTMLElement | null)[]>([]);

  // Which rows these are, not which array they arrived in. Callers build `fields` inline, so
  // depending on its identity would refocus and re-select on every keystroke — and the next
  // character would replace what was already typed.
  const rows = fields.map((field) => `${field.name}:${field.type ?? ""}`).join("|");

  /** What the field falls back to, so "leave it blank" is a visible option rather than a
   * thing to know. */
  const hint = (field: PromptField) => (field.default ? `= ${field.default}` : undefined);

  useEffect(() => {
    const first = inputs.current[0];
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const focusRow = (index: number) => {
    const target = inputs.current[index];
    if (!target) return false;
    target.focus();
    if (target instanceof HTMLInputElement) target.select();
    return true;
  };

  /** A JSON box needs its Enter key for newlines, so it does not step rows. */
  const onCellKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    index: number,
    type: ParamType | null
  ) => {
    if (isMultiline(type)) return;
    if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      if (!focusRow(index + 1) && event.key === "Enter") onSubmit();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(index - 1);
    }
  };

  const control = (field: PromptField, index: number, className: string) => {
    const value = values[field.name] ?? "";
    const invalid = !coerceArgument(value, field.type).ok;
    const register = (element: HTMLElement | null) => {
      inputs.current[index] = element;
    };
    const shared = {
      className: `${className}${invalid ? " is-invalid" : ""}`,
      spellCheck: false,
      autoComplete: "off",
      "aria-label": field.name,
      "aria-invalid": invalid || undefined,
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) =>
        onCellKeyDown(event, index, field.type)
    };

    if (field.type === "boolean") {
      return (
        <input
          {...shared}
          ref={register}
          type="checkbox"
          className={`${className} prompt-check`}
          checked={value === "true"}
          onChange={(event) => onChange(field.name, String(event.target.checked))}
        />
      );
    }

    if (isMultiline(field.type)) {
      return (
        <textarea
          {...shared}
          ref={register}
          rows={4}
          value={value}
          placeholder={hint(field) ?? (field.type === "array" ? "[]" : "{}")}
          onChange={(event) => onChange(field.name, event.target.value)}
        />
      );
    }

    return (
      <input
        {...shared}
        ref={register}
        type={field.type === "number" ? "number" : "text"}
        placeholder={hint(field)}
        value={value}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    );
  };

  const label = (field: PromptField) =>
    field.type ? `${field.name}: ${field.type}` : field.name;

  if (fields.length === 1) {
    return (
      <label className="parameter-prompt-single">
        <span>{label(fields[0])}</span>
        {control(fields[0], 0, "")}
      </label>
    );
  }

  const labels = t().request.parameters;

  return (
    <div className="parameter-grid" role="grid">
      <div className="parameter-grid-head" role="row">
        <span role="columnheader">{labels.colName}</span>
        <span role="columnheader">{labels.colValue}</span>
      </div>
      {fields.map((field, index) => (
        <div className="parameter-grid-row" role="row" key={field.name}>
          <span className="parameter-grid-name" role="rowheader">
            {label(field)}
          </span>
          {control(field, index, "parameter-grid-value")}
        </div>
      ))}
    </div>
  );
}
