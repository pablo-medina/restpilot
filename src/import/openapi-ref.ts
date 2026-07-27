/** Resolves internal `$ref` pointers (`#/components/...`) in OpenAPI/Swagger documents
 * and synthesizes a plausible example value from a (possibly `$ref`'d) JSON Schema. Real
 * specs define parameters/schemas once under `components` and reference them everywhere,
 * so without this the importer produces empty bodies and params for most real documents. */

type JsonObject = Record<string, unknown>;

const MAX_SCHEMA_DEPTH = 6;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decodeRefToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Follows a `#/a/b/c` JSON Pointer from the document root. Only internal refs are supported
 * (external file/URL refs are out of scope) — anything else resolves to `undefined`. */
function resolveJsonPointer(doc: JsonObject, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  const segments = ref
    .slice(2)
    .split("/")
    .filter(Boolean)
    .map(decodeRefToken);

  let current: unknown = doc;
  for (const segment of segments) {
    if (!isJsonObject(current) && !Array.isArray(current)) return undefined;
    current = (current as JsonObject | unknown[])[segment as never];
  }
  return current;
}

/** Resolves `value` if it's a `{ "$ref": "..." }` object, following chained refs. Guards
 * against a ref cycle (A -> B -> A) by tracking visited ref strings; returns `undefined` if
 * one is found rather than throwing, so a malformed spec degrades instead of crashing. */
export function dereference(doc: JsonObject, value: unknown, seen: Set<string> = new Set()): unknown {
  if (!isJsonObject(value)) return value;
  const ref = value.$ref;
  if (typeof ref !== "string") return value;
  if (seen.has(ref)) return undefined;

  const nextSeen = new Set(seen);
  nextSeen.add(ref);
  return dereference(doc, resolveJsonPointer(doc, ref), nextSeen);
}

function mergeAllOf(doc: JsonObject, schemas: unknown[], depth: number): unknown {
  let merged: JsonObject | undefined;
  let fallback: unknown;
  for (const sub of schemas) {
    const example = synthesizeExample(doc, sub, depth + 1);
    if (isJsonObject(example)) {
      merged = { ...(merged ?? {}), ...example };
    } else if (fallback === undefined && example !== undefined) {
      fallback = example;
    }
  }
  return merged ?? fallback;
}

function placeholderForPrimitive(schema: JsonObject): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  switch (schema.type) {
    case "string":
      return schema.format === "date-time" || schema.format === "date" ? new Date(0).toISOString() : "";
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}

/** Recursively builds an example value from a JSON Schema, dereferencing `$ref`s along the
 * way. Prefers an explicit `example`/`default`; otherwise synthesizes one from `type` /
 * `properties` / `items`. Bounded by `MAX_SCHEMA_DEPTH` so a self-referencing schema (a
 * `Node` with a `children: Node[]` property, common for trees/comments) terminates instead
 * of recursing forever. */
export function synthesizeExample(doc: JsonObject, schemaValue: unknown, depth = 0): unknown {
  const schema = dereference(doc, schemaValue);
  if (!isJsonObject(schema)) return undefined;

  if ("example" in schema) return schema.example;
  if ("default" in schema) return schema.default;
  if (depth >= MAX_SCHEMA_DEPTH) return undefined;

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return mergeAllOf(doc, schema.allOf, depth);
  }

  const alternatives = (schema.oneOf as unknown[] | undefined) ?? (schema.anyOf as unknown[] | undefined);
  if (Array.isArray(alternatives) && alternatives.length > 0) {
    return synthesizeExample(doc, alternatives[0], depth + 1);
  }

  const type = typeof schema.type === "string" ? schema.type : schema.properties ? "object" : schema.items ? "array" : undefined;

  if (type === "object") {
    const properties = isJsonObject(schema.properties) ? schema.properties : {};
    const result: JsonObject = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      const value = synthesizeExample(doc, propSchema, depth + 1);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  if (type === "array") {
    const item = synthesizeExample(doc, schema.items, depth + 1);
    return item !== undefined ? [item] : [];
  }

  return placeholderForPrimitive(schema);
}
