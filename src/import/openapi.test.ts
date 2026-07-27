import { describe, expect, it } from "vitest";
import { parseOpenApiSpec } from "./openapi";

const JSON_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Demo API", description: "A demo." },
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/users": {
      get: {
        summary: "List users",
        parameters: [{ name: "page", in: "query", schema: { default: "1" } }]
      }
    }
  }
});

const YAML_SPEC = `
openapi: 3.0.0
info:
  title: Demo API
  description: A demo.
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      summary: List users
      parameters:
        - name: page
          in: query
          schema:
            default: "1"
`;

describe("parseOpenApiSpec", () => {
  it("parses a JSON OpenAPI document", () => {
    const result = parseOpenApiSpec(JSON_SPEC);
    expect(result.name).toBe("Demo API");
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.url).toBe("https://api.example.com/users");
    expect(result.requests[0]?.queryParams[0]).toMatchObject({ key: "page", value: "1" });
  });

  it("produces a preview tree with no circular references for a single-operation path", () => {
    // Regression test: a path with exactly one operation used to push a folder tree
    // node whose `children` pointed back at the array it lived in, which crashed the
    // import preview dialog (`flattenTreeForCheckbox` recurses into `children`).
    const result = parseOpenApiSpec(JSON_SPEC);
    expect(() => JSON.stringify(result.tree)).not.toThrow();
    const group = result.tree[0];
    expect(group?.children).toHaveLength(1);
    expect(group?.children?.[0]).toMatchObject({ kind: "request", method: "GET" });
  });

  it("groups multiple operations on the same path into a real subfolder", () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Demo API" },
      paths: {
        "/users": {
          get: { summary: "List users" },
          post: { summary: "Create user" }
        }
      }
    });
    const result = parseOpenApiSpec(spec);
    expect(() => JSON.stringify(result.tree)).not.toThrow();
    expect(result.folders).toHaveLength(2); // top-level API group + the /users subfolder
    expect(result.requests).toHaveLength(2);
    const group = result.tree[0];
    expect(group?.children).toHaveLength(1);
    expect(group?.children?.[0]?.kind).toBe("folder");
    expect(group?.children?.[0]?.children).toHaveLength(2);
  });

  it("parses an equivalent YAML OpenAPI document identically", () => {
    const fromJson = parseOpenApiSpec(JSON_SPEC);
    const fromYaml = parseOpenApiSpec(YAML_SPEC);
    expect(fromYaml.name).toBe(fromJson.name);
    expect(fromYaml.requests).toHaveLength(fromJson.requests.length);
    expect(fromYaml.requests[0]?.url).toBe(fromJson.requests[0]?.url);
    expect(fromYaml.requests[0]?.queryParams[0]?.value).toBe(fromJson.requests[0]?.queryParams[0]?.value);
  });

  it("parses a Swagger 2.0 YAML document", () => {
    const swagger = `
swagger: "2.0"
info:
  title: Legacy API
paths:
  /ping:
    get:
      summary: Ping
`;
    const result = parseOpenApiSpec(swagger);
    expect(result.name).toBe("Legacy API");
    expect(result.requests).toHaveLength(1);
  });

  it("throws a clear error for content that is neither JSON nor YAML OpenAPI", () => {
    expect(() => parseOpenApiSpec("not: [valid, at, all: :::")).toThrow(/Invalid OpenAPI spec/);
  });

  it("throws when the document has no 'openapi' or 'swagger' field", () => {
    expect(() => parseOpenApiSpec(JSON.stringify({ info: { title: "X" }, paths: {} }))).toThrow(
      /missing 'openapi' or 'swagger'/
    );
  });

  it("resolves $ref'd parameters, request bodies, and nested schema properties", () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Refs API" },
      paths: {
        "/users": {
          post: {
            summary: "Create user",
            parameters: [{ $ref: "#/components/parameters/ApiKeyHeader" }],
            requestBody: { $ref: "#/components/requestBodies/UserBody" }
          }
        }
      },
      components: {
        parameters: {
          ApiKeyHeader: { name: "X-Api-Key", in: "header", schema: { type: "string", example: "secret" } }
        },
        requestBodies: {
          UserBody: {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/User" } }
            }
          }
        },
        schemas: {
          User: {
            type: "object",
            properties: {
              name: { type: "string", example: "Ada" },
              address: { $ref: "#/components/schemas/Address" }
            }
          },
          Address: {
            type: "object",
            properties: { city: { type: "string", example: "London" } }
          }
        }
      }
    });

    const result = parseOpenApiSpec(spec);
    const request = result.requests[0];
    expect(request?.headers).toEqual([{ id: expect.any(String), key: "X-Api-Key", value: "secret", enabled: true }]);
    expect(JSON.parse(request?.body ?? "{}")).toEqual({ name: "Ada", address: { city: "London" } });
  });
});
