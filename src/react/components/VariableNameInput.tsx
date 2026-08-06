import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getEffectiveVariables } from "../../app/environments";

type DropdownState = {
  names: string[];
  activeIndex: number;
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** Text input for a bare variable name (no `${…}` wrapper) that hints the
 * names already defined in globals and the active environment. */
export function VariableNameInput({ value, onValueChange, onKeyDown, onBlur, onFocus, ...rest }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdown, setDropdown] = useState<DropdownState | null>(null);
  const listId = useId();

  const closeDropdown = () => setDropdown(null);

  const computeDropdown = (input: HTMLInputElement, filter: string): DropdownState | null => {
    const query = filter.trim().toLowerCase();
    const names = Array.from(
      new Set(
        getEffectiveVariables()
          .map((variable) => variable.name.trim())
          .filter((name) => name && (!query || name.toLowerCase().includes(query)))
      )
    ).sort((a, b) => a.localeCompare(b));
    if (names.length === 0) return null;

    const rect = input.getBoundingClientRect();
    const estimated = Math.min(names.length * 28 + 8, 240);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < 120 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(80, Math.min(estimated, openUp ? spaceAbove : spaceBelow));

    return {
      names,
      activeIndex: 0,
      top: Math.round(openUp ? rect.top - maxHeight - 4 : rect.bottom + 4),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      maxHeight: Math.round(maxHeight)
    };
  };

  const choose = (name: string) => {
    onValueChange(name);
    closeDropdown();
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (dropdown) {
      const { names, activeIndex } = dropdown;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setDropdown({ ...dropdown, activeIndex: (activeIndex + 1) % names.length });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setDropdown({ ...dropdown, activeIndex: (activeIndex - 1 + names.length) % names.length });
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const chosen = names[activeIndex];
        if (chosen) {
          event.preventDefault();
          event.stopPropagation();
          choose(chosen);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeDropdown();
        return;
      }
    }
    onKeyDown?.(event);
  };

  return (
    <>
      <input
        ref={inputRef}
        {...rest}
        type="text"
        value={value}
        spellCheck={false}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-owns={dropdown ? listId : undefined}
        aria-expanded={dropdown ? true : false}
        onChange={(event) => {
          onValueChange(event.target.value);
          setDropdown(computeDropdown(event.currentTarget, event.target.value));
        }}
        onFocus={(event) => {
          setDropdown(computeDropdown(event.currentTarget, event.currentTarget.value));
          onFocus?.(event);
        }}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          // Let a click on the list land before the dropdown unmounts.
          setTimeout(() => {
            if (!dropdownRef.current?.matches(":hover")) closeDropdown();
          }, 180);
          onBlur?.(event);
        }}
      />
      {dropdown
        ? createPortal(
            <div
              ref={dropdownRef}
              id={listId}
              className="var-autocomplete"
              role="listbox"
              style={{
                position: "fixed",
                top: dropdown.top,
                left: dropdown.left,
                minWidth: dropdown.width,
                maxHeight: dropdown.maxHeight,
                overflowY: "auto",
                zIndex: 10000
              }}
            >
              {dropdown.names.map((name, index) => (
                <button
                  key={name}
                  className={`var-ac-item${index === dropdown.activeIndex ? " active" : ""}`}
                  role="option"
                  aria-selected={index === dropdown.activeIndex}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(name);
                  }}
                >
                  <span className="var-ac-name">{name}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
