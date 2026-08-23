import { useEffect, useRef, useState } from "react";
import { iconChevronRight } from "../../lib/icons";
import { Icon } from "./Icon";

export type DropdownOption = { value: string; label: string; hint?: string };

type Props = {
  value: string;
  options: DropdownOption[];
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: string) => void;
};

/** Listbox styled with the app's own tokens — a native `<select>` renders as OS chrome.
 * The list is sized to its content, not to the trigger, so hints stay readable. */
export function Dropdown({ value, options, placeholder, ariaLabel, disabled, className, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
  }, [open, options, value]);

  // Flip above the trigger when there is not enough room below.
  useEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    const trigger = rootRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const needed = list.offsetHeight + 8;
    list.classList.toggle("is-above", window.innerHeight - trigger.bottom < needed && trigger.top > needed);
  }, [open]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % Math.max(options.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + options.length) % Math.max(options.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(active);
    }
  };

  return (
    <div ref={rootRef} className={`rp-dropdown${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className="rp-dropdown-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? "rp-dropdown-value" : "rp-dropdown-value is-placeholder"}>
          {selected?.label ?? placeholder}
        </span>
        <Icon className="rp-dropdown-chevron" html={iconChevronRight} />
      </button>

      {open ? (
        <div ref={listRef} className="rp-dropdown-list" role="listbox" aria-label={ariaLabel}>
          {options.length === 0 ? (
            <p className="rp-dropdown-empty">{placeholder}</p>
          ) : (
            options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`rp-dropdown-option${index === active ? " is-active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => commit(index)}
              >
                <span className="rp-dropdown-option-label">{option.label}</span>
                {option.hint ? <span className="rp-dropdown-option-hint">{option.hint}</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
