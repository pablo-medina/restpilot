type Opener = () => void;

let opener: Opener | null = null;

export function registerVariablesManagerDialogOpener(fn: Opener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function openVariablesManagerDialog(): void {
  opener?.();
}
