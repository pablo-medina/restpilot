import { escapeHtml } from "./content-display";
import { getEffectiveVariables } from "./app/environments";
import type { Variable } from "./types";

let dropdown: HTMLElement | null = null;
let currentInput: HTMLInputElement | null = null;
let currentVars: Variable[] = [];
let dollarIndex = -1;
let activeIndex = 0;
let suppressBlur = false;

function getActiveVariables(): Variable[] {
  return getEffectiveVariables().filter((v) => v.enabled && v.name.trim());
}

export function bindVariableAutocomplete(input: HTMLInputElement) {
  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeydown);
  input.addEventListener("blur", onBlur);
}

/** Returns true when the autocomplete dropdown is visible. */
export function isAutocompleteOpen(): boolean {
  return dropdown !== null;
}

/** Close the autocomplete dropdown if open. Call this before re-render. */
export function closeAutocomplete() {
  if (dropdown) {
    dropdown.remove();
    dropdown = null;
  }
  currentInput = null;
  currentVars = [];
  dollarIndex = -1;
  activeIndex = 0;
}

function onInput(this: HTMLInputElement) {
  if (!this.isConnected) return;
  const input = this;
  const pos = input.selectionStart ?? 0;

  let dollarIdx = -1;
  for (let i = pos - 1; i >= 0; i--) {
    if (input.value[i] === "$") {
      const between = input.value.slice(i + 1, pos);
      if (between.includes("}")) break;
      dollarIdx = i;
      break;
    }
  }

  if (dollarIdx === -1) {
    closeAutocomplete();
    return;
  }

  const afterDollar = input.value.slice(dollarIdx + 1, pos);
  if (afterDollar !== "" && !afterDollar.startsWith("{")) {
    closeAutocomplete();
    return;
  }

  dollarIndex = dollarIdx;
  currentInput = input;

  const filter = afterDollar.startsWith("{") ? afterDollar.slice(1) : "";
  const all = getActiveVariables();
  currentVars = filter
    ? all.filter((v) => v.name.toLowerCase().includes(filter.toLowerCase()))
    : all;

  if (currentVars.length === 0) {
    closeAutocomplete();
    return;
  }

  renderDropdown(input, filter);
}

function renderDropdown(input: HTMLInputElement, filter: string) {
  if (dropdown) {
    dropdown.remove();
    dropdown = null;
  }

  const html = currentVars
    .map(
      (v, i) => `
    <button class="var-ac-item${i === 0 ? " active" : ""}" role="option" aria-selected="${i === 0}" data-index="${i}" type="button">
      <span class="var-ac-name">\${${escapeHtml(v.name)}}</span>
    </button>`
    )
    .join("");

  dropdown = document.createElement("div");
  dropdown.className = "var-autocomplete";
  dropdown.setAttribute("role", "listbox");
  dropdown.innerHTML = html;
  document.body.appendChild(dropdown);

  activeIndex = 0;

  positionDropdown(input, dropdown);

  dropdown.addEventListener("mousedown", (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(".var-ac-item");
    if (!item) return;
    e.preventDefault();
    suppressBlur = true;
    const idx = parseInt(item.dataset.index ?? "0", 10);
    const chosen = currentVars[idx];
    if (chosen) applyComplete(chosen.name);
  });
}

function cursorX(input: HTMLInputElement): number {
  const pos = input.selectionStart ?? input.value.length;
  const textBefore = input.value.slice(0, pos);
  const span = document.createElement("span");
  const s = getComputedStyle(input);
  span.style.cssText = `
    font-family: ${s.fontFamily};
    font-size: ${s.fontSize};
    font-weight: ${s.fontWeight};
    font-style: ${s.fontStyle};
    font-variant: ${s.fontVariant};
    letter-spacing: ${s.letterSpacing};
    word-spacing: ${s.wordSpacing};
    text-indent: ${s.textIndent};
    text-transform: ${s.textTransform};
    padding: 0; margin: 0; border: 0;
    position: fixed; visibility: hidden;
    white-space: pre;
  `;
  span.textContent = textBefore;
  document.body.appendChild(span);
  const w = span.offsetWidth;
  document.body.removeChild(span);
  const inputRect = input.getBoundingClientRect();
  const pl = parseFloat(s.paddingLeft) || 0;
  const bl = parseFloat(s.borderLeftWidth) || 0;
  return inputRect.left + pl + bl + w;
}

function positionDropdown(input: HTMLInputElement, el: HTMLElement) {
  el.style.visibility = "hidden";
  el.style.position = "fixed";
  el.style.left = "0px";
  el.style.top = "0px";

  const naturalWidth = el.offsetWidth || 200;
  const acWidth = Math.max(160, Math.min(naturalWidth, 480));
  const height = el.offsetHeight || 180;
  const inputRect = input.getBoundingClientRect();
  const spaceBelow = window.innerHeight - inputRect.bottom - 8;
  const spaceAbove = inputRect.top - 8;

  let top: number;
  let maxH: number;

  if (spaceBelow >= height || spaceBelow >= 120) {
    top = inputRect.bottom + 4;
    maxH = Math.max(120, Math.min(height, spaceBelow));
  } else if (spaceAbove >= height || spaceAbove >= 120) {
    top = inputRect.top - Math.min(height, spaceAbove) - 4;
    maxH = Math.max(120, Math.min(height, spaceAbove));
  } else {
    if (spaceBelow >= spaceAbove) {
      top = inputRect.bottom + 4;
      maxH = Math.max(120, spaceBelow);
    } else {
      top = 8;
      maxH = Math.max(120, spaceAbove);
    }
  }

  const cx = cursorX(input);
  const left = Math.max(4, Math.min(cx, window.innerWidth - acWidth - 8));

  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
  el.style.maxHeight = `${Math.round(maxH)}px`;
  el.style.visibility = "";
}

function onKeydown(this: HTMLInputElement, e: KeyboardEvent) {
  if (!dropdown || !currentInput || currentInput !== this) return;

  const items = dropdown.querySelectorAll<HTMLElement>(".var-ac-item");
  if (items.length === 0) return;

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActive(items);
      break;
    case "ArrowUp":
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActive(items);
      break;
    case "Enter":
    case "Tab":
      e.preventDefault();
      e.stopPropagation();
      const chosen = currentVars[activeIndex];
      if (chosen) applyComplete(chosen.name);
      break;
    case "Escape":
      e.preventDefault();
      closeAutocomplete();
      break;
  }
}

function updateActive(items: NodeListOf<HTMLElement>) {
  items.forEach((item, i) => {
    const isActive = i === activeIndex;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  items[activeIndex]?.scrollIntoView({ block: "nearest" });
}

function onBlur() {
  if (suppressBlur) {
    suppressBlur = false;
    return;
  }
  setTimeout(() => {
    if (dropdown && !dropdown.matches(":hover")) {
      closeAutocomplete();
    }
  }, 180);
}

function applyComplete(varName: string) {
  if (!currentInput || !currentInput.isConnected) {
    closeAutocomplete();
    return;
  }

  const input = currentInput;
  const before = input.value.slice(0, dollarIndex);
  const after = input.value.slice(input.selectionStart ?? input.value.length);
  const insertion = `\${${varName}}`;
  input.value = before + insertion + after;
  const newPos = before.length + insertion.length;
  input.setSelectionRange(newPos, newPos);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  closeAutocomplete();
  input.focus();
}

/** Attach a global mousedown listener that closes the autocomplete on outside click. */
export function attachAutocompleteGlobalClose() {
  document.addEventListener("mousedown", (e) => {
    if (!dropdown) return;
    if (dropdown.contains(e.target as Node)) return;
    if (currentInput?.contains(e.target as Node)) return;
    closeAutocomplete();
  });
}
