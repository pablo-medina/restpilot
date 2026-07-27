import { describe, expect, it } from "vitest";
import { dereference, synthesizeExample } from "./openapi-ref";

describe("dereference", () => {
  it("returns non-ref values unchanged", () => {
    expect(dereference({}, { name: "page" })).toEqual({ name: "page" });
    expect(dereference({}, "plain string")).toBe("plain string");
    expect(dereference({}, undefined)).toBeUndefined();
  });

  it("resolves a single $ref", () => {
    const doc = { components: { schemas: { User: { type: "object" } } } };
    expect(dereference(doc, { $ref: "#/components/schemas/User" })).toEqual({ type: "object" });
  });

  it("follows chained refs", () => {
    const doc = {
      components: {
        schemas: {
          A: { $ref: "#/components/schemas/B" },
          B: { type: "string" }
        }
      }
    };
    expect(dereference(doc, { $ref: "#/components/schemas/A" })).toEqual({ type: "string" });
  });

  it("returns undefined for a circular ref chain instead of looping forever", () => {
    const doc = {
      components: {
        schemas: {
          A: { $ref: "#/components/schemas/B" },
          B: { $ref: "#/components/schemas/A" }
        }
      }
    };
    expect(dereference(doc, { $ref: "#/components/schemas/A" })).toBeUndefined();
  });

  it("returns undefined for a ref that points nowhere", () => {
    expect(dereference({}, { $ref: "#/components/schemas/Missing" })).toBeUndefined();
  });

  it("decodes ~0/~1 JSON Pointer escapes", () => {
    const doc = { components: { schemas: { "a/b": { type: "string" } } } };
    expect(dereference(doc, { $ref: "#/components/schemas/a~1b" })).toEqual({ type: "string" });
  });
});

describe("synthesizeExample", () => {
  it("prefers an explicit example over synthesizing one", () => {
    expect(synthesizeExample({}, { type: "string", example: "hi" })).toBe("hi");
  });

  it("prefers default when there is no example", () => {
    expect(synthesizeExample({}, { type: "integer", default: 42 })).toBe(42);
  });

  it("synthesizes placeholders for primitive types without example/default", () => {
    expect(synthesizeExample({}, { type: "string" })).toBe("");
    expect(synthesizeExample({}, { type: "integer" })).toBe(0);
    expect(synthesizeExample({}, { type: "boolean" })).toBe(false);
  });

  it("uses the first enum value when present", () => {
    expect(synthesizeExample({}, { type: "string", enum: ["b", "a"] })).toBe("b");
  });

  it("builds a nested object from properties, including $ref'd properties", () => {
    const doc = {
      components: {
        schemas: {
          Address: {
            type: "object",
            properties: { city: { type: "string", example: "Springfield" } }
          }
        }
      }
    };
    const schema = {
      type: "object",
      properties: {
        name: { type: "string", example: "Homer" },
        address: { $ref: "#/components/schemas/Address" }
      }
    };
    expect(synthesizeExample(doc, schema)).toEqual({
      name: "Homer",
      address: { city: "Springfield" }
    });
  });

  it("builds an array from 'items'", () => {
    expect(synthesizeExample({}, { type: "array", items: { type: "string", example: "x" } })).toEqual(["x"]);
  });

  it("merges allOf branches into one object", () => {
    const schema = {
      allOf: [
        { type: "object", properties: { id: { type: "integer", example: 1 } } },
        { type: "object", properties: { name: { type: "string", example: "x" } } }
      ]
    };
    expect(synthesizeExample({}, schema)).toEqual({ id: 1, name: "x" });
  });

  it("uses the first oneOf/anyOf alternative", () => {
    const schema = { oneOf: [{ type: "string", example: "a" }, { type: "integer", example: 1 }] };
    expect(synthesizeExample({}, schema)).toBe("a");
  });

  it("terminates on a self-referencing schema instead of recursing forever", () => {
    const doc = {
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: {
              name: { type: "string", example: "root" },
              children: { type: "array", items: { $ref: "#/components/schemas/Node" } }
            }
          }
        }
      }
    };
    const result = synthesizeExample(doc, { $ref: "#/components/schemas/Node" });
    expect(result).toBeTruthy();
    // Must actually terminate (no stack overflow) and stay JSON-serializable.
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("returns undefined for an unresolvable schema", () => {
    expect(synthesizeExample({}, { $ref: "#/components/schemas/Missing" })).toBeUndefined();
    expect(synthesizeExample({}, undefined)).toBeUndefined();
  });
});
