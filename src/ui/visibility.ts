/**
 * Layout visibility helpers — pair with scoped CSS `.your-block.is-hidden { display: none }`.
 * See AGENTS.md § Flex and panel layout (conditional sections).
 */

/** Class suffix for string templates: `class="panel${hiddenClass(!visible)}"`. */
export function hiddenClass(hidden: boolean): string {
  return hidden ? " is-hidden" : "";
}

export function setVisible(element: HTMLElement | null | undefined, visible: boolean): void {
  element?.classList.toggle("is-hidden", !visible);
}
