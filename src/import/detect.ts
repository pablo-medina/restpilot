import { parse as parseYaml } from "yaml";
import { COLLECTION_FORMAT } from "../app/collection-format";
import { looksLikeCurl } from "../lib/curl";
import type { ImportSource } from "./types";

function isOpenApiDocument(value: Record<string, unknown>): boolean {
  return typeof value.openapi === "string" || typeof value.swagger === "string";
}

/** Cheap format sniffing for pasted text — no full parsing, just enough to route to the right importer. */
export function detectImportSource(text: string): ImportSource | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (looksLikeCurl(trimmed)) return "curl";

  let parsed: unknown;
  let isYaml = false;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // OpenAPI/Swagger is the only source that realistically ships as YAML — try that
    // before giving up. Postman collections and RestPilot exports are JSON-only.
    try {
      parsed = parseYaml(trimmed);
      isYaml = true;
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Record<string, unknown>;

  if (isOpenApiDocument(value)) return "openapi";
  if (isYaml) return null;

  if (value.format === COLLECTION_FORMAT) return "restpilot";
  if (Array.isArray(value.item) && value.info && typeof value.info === "object") return "postman";

  return null;
}
