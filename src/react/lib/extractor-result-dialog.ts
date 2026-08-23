export type ExtractorResult = { title: string; value: string; error?: string };

let opener: ((result: ExtractorResult) => void) | null = null;

export function registerExtractorResultDialog(fn: (result: ExtractorResult) => void): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function showExtractorResult(result: ExtractorResult): void {
  opener?.(result);
}
