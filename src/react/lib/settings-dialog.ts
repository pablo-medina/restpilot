type Opener = () => void;

let opener: Opener | null = null;

export function registerSettingsDialogOpener(fn: Opener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function openSettingsDialog(): void {
  opener?.();
}
