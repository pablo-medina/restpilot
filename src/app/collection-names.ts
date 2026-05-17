import { t } from "../i18n";
import type { DuplicateNamingMode, TreeItem } from "../types";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function duplicateBaseTitle(title: string) {
  return title.replace(/\s+\(\d+\)$/, "").trim() || title;
}

export function numberedDuplicateTitle(title: string, parentId: string | null, items: TreeItem[]) {
  const base = duplicateBaseTitle(title);
  const siblings = items.filter((item) => item.parentId === parentId);
  const pattern = new RegExp(`^${escapeRegExp(base)}(?: \\((\\d+)\\))?$`);
  let maxIndex = 1;

  for (const sibling of siblings) {
    const match = sibling.title.match(pattern);
    if (!match) continue;
    const index = match[1] ? Number.parseInt(match[1], 10) : 1;
    if (Number.isFinite(index)) maxIndex = Math.max(maxIndex, index);
  }

  return `${base} (${maxIndex + 1})`;
}

function copyOfDuplicateTitle(title: string) {
  const trimmed = title.trim() || title;
  return `${t().settings.duplicateNameCopyOfPrefix}${trimmed}`;
}

/** Title for a duplicated tree item among siblings in the same parent folder. */
export function titleForDuplicate(
  sourceTitle: string,
  parentId: string | null,
  items: TreeItem[],
  mode: DuplicateNamingMode
) {
  if (mode === "original") return sourceTitle.trim() || sourceTitle;
  if (mode === "numbered") return numberedDuplicateTitle(sourceTitle, parentId, items);
  return copyOfDuplicateTitle(sourceTitle);
}

export function normalizeDuplicateNaming(
  value: unknown,
  legacyNumberDuplicateNames?: unknown
): DuplicateNamingMode {
  if (value === "original" || value === "copyOf" || value === "numbered") return value;
  if (legacyNumberDuplicateNames === true) return "numbered";
  return "copyOf";
}
