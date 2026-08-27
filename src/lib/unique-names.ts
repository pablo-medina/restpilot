/** Why a name cannot be used. `null` means it is fine. */
export type NameProblem = "empty" | "duplicate" | null;

/** Names are required and unique within their list; `selfId` excludes the item being edited. */
export function uniqueNameProblem(
  name: string,
  items: readonly { id: string; name: string }[],
  selfId: string
): NameProblem {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  const clash = items.some(
    (item) => item.id !== selfId && item.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  return clash ? "duplicate" : null;
}

/** Matches an identifier a script can write after a dot, so `lib.cuil` reads as JavaScript
 * rather than forcing `lib["…"]`. Deliberately ASCII-only and reserved words are not checked:
 * `new Function` rejects those on its own with a clear message. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isIdentifier(name: string): boolean {
  return IDENTIFIER.test(name.trim());
}
