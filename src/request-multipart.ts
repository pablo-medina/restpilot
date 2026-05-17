import type { SavedRequest } from "./types";

export function hasEnabledFileParts(request: SavedRequest) {
  return request.form.some(
    (field) => field.enabled && field.partType === "file" && field.key.trim()
  );
}

export function hasMissingMultipartFiles(request: SavedRequest) {
  return request.form.some(
    (field) =>
      field.enabled &&
      field.partType === "file" &&
      field.key.trim() &&
      !field.value.trim()
  );
}

export function missingMultipartFileNames(request: SavedRequest) {
  return request.form
    .filter(
      (field) =>
        field.enabled &&
        field.partType === "file" &&
        field.key.trim() &&
        !field.value.trim()
    )
    .map((field) => field.fileName || field.key.trim());
}
