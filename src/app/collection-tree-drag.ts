/** Hit-testing helpers for collection tree pointer reorder. */

export function treeRowAtPointer(
  tree: HTMLElement,
  clientX: number,
  clientY: number
): HTMLElement | null {
  const rows = [...tree.querySelectorAll<HTMLElement>(".tree-row[data-tree-id]")];
  if (!rows.length) return null;

  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (
      clientY >= rect.top &&
      clientY <= rect.bottom &&
      clientX >= rect.left &&
      clientX <= rect.right
    ) {
      return row;
    }
  }

  for (let i = 0; i < rows.length - 1; i++) {
    const above = rows[i]!.getBoundingClientRect();
    const below = rows[i + 1]!.getBoundingClientRect();
    if (clientY <= above.bottom || clientY >= below.top) continue;
    const spanLeft = Math.min(above.left, below.left);
    const spanRight = Math.max(above.right, below.right);
    if (clientX < spanLeft || clientX > spanRight) continue;
    const mid = (above.bottom + below.top) / 2;
    return clientY < mid ? rows[i]! : rows[i + 1]!;
  }

  return null;
}

export function shouldOfferTreeRootDrop(
  tree: HTMLElement,
  panel: HTMLElement,
  clientX: number,
  clientY: number
): boolean {
  if (treeRowAtPointer(tree, clientX, clientY)) return false;

  const toolbar = panel.querySelector<HTMLElement>(".collection-sidebar-toolbar");
  if (toolbar) {
    const rect = toolbar.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return true;
    }
  }

  const rows = [...tree.querySelectorAll<HTMLElement>(".tree-row[data-tree-id]")];
  const treeRect = tree.getBoundingClientRect();
  if (clientX < treeRect.left || clientX > treeRect.right) return false;
  if (clientY < treeRect.top || clientY > treeRect.bottom) return false;

  if (!rows.length) return true;

  const lastRect = rows[rows.length - 1]!.getBoundingClientRect();
  return clientY > lastRect.bottom + 6;
}
