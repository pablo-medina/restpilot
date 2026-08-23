type Opener = (extractorId?: string) => void;

let opener: Opener | null = null;

export function registerExtractorsDialogOpener(fn: Opener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function openExtractorsDialog(extractorId?: string): void {
  opener?.(extractorId);
}
