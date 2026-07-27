import { describe, expect, it } from "vitest";
import { detectImportSource } from "./detect";

describe("detectImportSource", () => {
  it("recognizes a pasted curl command", () => {
    expect(detectImportSource('curl -X POST "https://api.example.com" -H "Accept: json"')).toBe("curl");
  });

  it("recognizes a curl command copied from devtools with line continuations", () => {
    expect(detectImportSource('curl "https://api.example.com" \\\n  -H "Accept: json"')).toBe("curl");
  });

  it("recognizes a RestPilot collection export", () => {
    const json = JSON.stringify({ format: "restpilot-collection", version: 1, collection: {} });
    expect(detectImportSource(json)).toBe("restpilot");
  });

  it("recognizes an OpenAPI 3 document", () => {
    const json = JSON.stringify({ openapi: "3.0.0", info: { title: "Test" }, paths: {} });
    expect(detectImportSource(json)).toBe("openapi");
  });

  it("recognizes a Swagger 2 document", () => {
    const json = JSON.stringify({ swagger: "2.0", info: { title: "Test" }, paths: {} });
    expect(detectImportSource(json)).toBe("openapi");
  });

  it("recognizes a Postman collection", () => {
    const json = JSON.stringify({ info: { name: "Test", schema: "collection/v2.1.0" }, item: [] });
    expect(detectImportSource(json)).toBe("postman");
  });

  it("recognizes an OpenAPI document written as YAML", () => {
    const yaml = "openapi: 3.0.0\ninfo:\n  title: Test\npaths: {}\n";
    expect(detectImportSource(yaml)).toBe("openapi");
  });

  it("recognizes a Swagger document written as YAML", () => {
    const yaml = 'swagger: "2.0"\ninfo:\n  title: Test\npaths: {}\n';
    expect(detectImportSource(yaml)).toBe("openapi");
  });

  it("does not misidentify a Postman-shaped document written as YAML", () => {
    // Postman/RestPilot exports are JSON-only in practice; a YAML doc that happens to
    // parse into a similar shape should not be routed to those importers.
    const yaml = "info:\n  name: Test\nitem: []\n";
    expect(detectImportSource(yaml)).toBeNull();
  });

  it("returns null for empty or blank text", () => {
    expect(detectImportSource("")).toBeNull();
    expect(detectImportSource("   \n  ")).toBeNull();
  });

  it("returns null for unrelated JSON", () => {
    expect(detectImportSource(JSON.stringify({ hello: "world" }))).toBeNull();
  });

  it("returns null for invalid JSON and non-curl text", () => {
    expect(detectImportSource("not valid json at all")).toBeNull();
  });
});
