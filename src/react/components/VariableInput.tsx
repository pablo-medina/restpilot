import { useState, useRef, useId, forwardRef } from "react";
import { createPortal } from "react-dom";
import { getEffectiveVariables } from "../../app/environments";
import type { Variable } from "../../types";

function getActiveVars(): Variable[] {
  return getEffectiveVariables().filter((v) => v.enabled && v.name.trim());
}

/** Measures how many CSS pixels wide the text before the cursor is. */
function textWidthAtCursor(input: HTMLInputElement): number {
  const pos = input.selectionStart ?? input.value.length;
  const text = input.value.slice(0, pos);
  const s = getComputedStyle(input);
  const span = document.createElement("span");
  span.style.cssText = `
    font-family:${s.fontFamily};font-size:${s.fontSize};
    font-weight:${s.fontWeight};font-style:${s.fontStyle};
    letter-spacing:${s.letterSpacing};text-transform:${s.textTransform};
    padding:0;margin:0;border:0;position:fixed;visibility:hidden;white-space:pre;
  `;
  span.textContent = text;
  document.body.appendChild(span);
  const w = span.offsetWidth;
  document.body.removeChild(span);
  return w;
}

type DropdownState = {
  vars: Variable[];
  /** Index of the `{{` that opened the template being completed. */
  openIndex: number;
  activeIndex: number;
  top: number;
  left: number;
  maxHeight: number;
};

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  onValueChange?: (value: string) => void;
};

export const VariableInput = forwardRef<HTMLInputElement, Props>(
  function VariableInput({ onValueChange, onChange, onKeyDown, onBlur, ...rest }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdown, setDropdown] = useState<DropdownState | null>(null);
    const listId = useId();

    const combinedRef = (el: HTMLInputElement | null) => {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
    };

    const closeDropdown = () => setDropdown(null);

    const computeDropdown = (input: HTMLInputElement): DropdownState | null => {
      const pos = input.selectionStart ?? 0;
      // Walk back to the `{{` that opened the template the cursor sits in. A `}` on the way
      // means the nearest template is already closed, so there is nothing to complete.
      let openIdx = -1;
      for (let i = pos - 2; i >= 0; i--) {
        if (input.value[i] === "{" && input.value[i + 1] === "{") {
          openIdx = i;
          break;
        }
        if (input.value[i] === "}") break;
      }
      if (openIdx === -1) return null;

      const filter = input.value.slice(openIdx + 2, pos);
      const all = getActiveVars();
      const vars = filter
        ? all.filter((v) => v.name.toLowerCase().includes(filter.toLowerCase()))
        : all;
      if (vars.length === 0) return null;

      const textW = textWidthAtCursor(input);
      const s = getComputedStyle(input);
      const pl = parseFloat(s.paddingLeft) || 0;
      const bl = parseFloat(s.borderLeftWidth) || 0;
      const rect = input.getBoundingClientRect();

      const cx = rect.left + pl + bl + textW;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const estH = Math.min(vars.length * 32 + 8, 240);

      let top: number;
      let maxH: number;
      if (spaceBelow >= estH || spaceBelow >= 120) {
        top = rect.bottom + 4;
        maxH = Math.max(120, Math.min(estH, spaceBelow));
      } else if (spaceAbove >= 120) {
        top = rect.top - Math.min(estH, spaceAbove) - 4;
        maxH = Math.max(120, Math.min(estH, spaceAbove));
      } else {
        top = rect.bottom + 4;
        maxH = Math.max(80, spaceBelow);
      }

      const acWidth = Math.max(160, Math.min(280, 480));
      const left = Math.max(4, Math.min(cx, window.innerWidth - acWidth - 8));

      return { vars, openIndex: openIdx, activeIndex: 0, top: Math.round(top), left: Math.round(left), maxHeight: Math.round(maxH) };
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = computeDropdown(e.currentTarget);
      setDropdown(next);
      onChange?.(e);
      onValueChange?.(e.target.value);
    };

    const applyComplete = (varName: string) => {
      const input = inputRef.current;
      if (!input || !dropdown) return;
      const before = input.value.slice(0, dropdown.openIndex);
      const after = input.value.slice(input.selectionStart ?? input.value.length);
      const insertion = `{{${varName}}}`;
      const newValue = before + insertion + after;
      const newPos = before.length + insertion.length;

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeInputValueSetter?.call(input, newValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.setSelectionRange(newPos, newPos);
      onValueChange?.(newValue);
      closeDropdown();
      input.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (dropdown) {
        const { vars, activeIndex } = dropdown;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setDropdown({ ...dropdown, activeIndex: (activeIndex + 1) % vars.length });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setDropdown({ ...dropdown, activeIndex: (activeIndex - 1 + vars.length) % vars.length });
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          const chosen = vars[activeIndex];
          if (chosen) {
            e.preventDefault();
            e.stopPropagation();
            applyComplete(chosen.name);
            return;
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeDropdown();
          return;
        }
      }
      onKeyDown?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setTimeout(() => {
        if (!dropdownRef.current?.matches(":hover")) {
          closeDropdown();
        }
      }, 180);
      onBlur?.(e);
    };

    return (
      <>
        <input
          ref={combinedRef}
          {...rest}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          aria-autocomplete={dropdown ? "list" : undefined}
          aria-owns={dropdown ? listId : undefined}
          aria-expanded={dropdown ? true : undefined}
        />
        {dropdown && createPortal(
          <div
            ref={dropdownRef}
            id={listId}
            className="var-autocomplete"
            role="listbox"
            style={{
              position: "fixed",
              top: dropdown.top,
              left: dropdown.left,
              maxHeight: dropdown.maxHeight,
              overflowY: "auto",
              zIndex: 10000
            }}
          >
            {dropdown.vars.map((v, i) => (
              <button
                key={v.id}
                className={`var-ac-item${i === dropdown.activeIndex ? " active" : ""}`}
                role="option"
                aria-selected={i === dropdown.activeIndex}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyComplete(v.name);
                }}
              >
                <span className="var-ac-name">{`{{${v.name}}}`}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
      </>
    );
  }
);
