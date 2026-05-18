import { t } from "../i18n";
import { normalizeParentId } from "./collection-parent";
import type { DuplicateNamingMode, TreeItem } from "../types";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function duplicateBaseTitle(title: string) {
  return title.replace(/\s+\(\d+\)$/, "").trim() || title;
}

export function numberedDuplicateTitle(title: string, parentId: string, items: TreeItem[]) {
  const base = duplicateBaseTitle(title);
  const parent = normalizeParentId(parentId);
  const siblings = items.filter((item) => normalizeParentId(item.parentId) === parent);
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
  parentId: string,
  items: TreeItem[],
  mode: DuplicateNamingMode
) {
  if (mode === "numbered") return numberedDuplicateTitle(sourceTitle, parentId, items);
  return copyOfDuplicateTitle(sourceTitle);
}

export function normalizeDuplicateNaming(
  value: unknown,
  legacyNumberDuplicateNames?: unknown
): DuplicateNamingMode {
  if (value === "copyOf" || value === "numbered") return value;
  if (value === "original") return "copyOf";
  if (legacyNumberDuplicateNames === true) return "numbered";
  return "copyOf";
}
