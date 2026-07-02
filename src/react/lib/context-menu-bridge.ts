type ContextMenuBridge = {
  sync: () => void;
  close: () => void;
};

let bridge: ContextMenuBridge | null = null;

export function registerContextMenuBridge(next: ContextMenuBridge): void {
  bridge = next;
}

export function syncContextMenuBridge(): void {
  bridge?.sync();
}

export function closeContextMenuBridge(): void {
  bridge?.close();
}
