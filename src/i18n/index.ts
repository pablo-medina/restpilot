import { en } from "./en";
import { es } from "./es";

export type Locale = "en" | "es";
export type TranslationTree = typeof en;

const catalogs: Record<Locale, TranslationTree> = { en, es: es as unknown as TranslationTree };

let locale: Locale = "en";

export function setLocale(next: Locale) {
  locale = next;
  document.documentElement.lang = next === "es" ? "es" : "en";
}

export function t(): TranslationTree {
  return catalogs[locale];
}
