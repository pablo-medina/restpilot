import { describe, expect, it } from "vitest";
import { CONFIG_VERSION, LEGACY_CONFIG_VERSION, defaultConfig, type AppConfig, type SavedRequest } from "../types";
import { normalizeConfig } from "./config-normalize";
import { migrateTemplateText, migrateVariableSyntax, needsVariableSyntaxMigration } from "./migrate-variable-syntax";

function legacyRequest(): SavedRequest {
  return {
    id: "r1",
    kind: "request",
    parentId: "/",
    title: "Login",
    method: "POST",
    url: "${base_url}/auth/login",
    urlHash: "${fragment}",
    queryParams: [{ id: "q1", key: "tenant_${env}", value: "${tenant}", enabled: true }],
    headers: [{ id: "h1", key: "X-Trace", value: "${trace_id}", enabled: true }],
    bodyMode: "raw",
    rawType: "json",
    body: '{"username": "${username}"}',
    graphqlVariables: '{"id": "${id}"}',
    form: [{ id: "f1", key: "field", value: "${form_value}", enabled: true, partType: "text" }],
    streamResponse: false,
    auth: { type: "bearer", bearerToken: "${token}" },
    lastResponse: null,
    lastError: null
  };
}

function legacyConfig(): AppConfig {
  return {
    ...defaultConfig(),
    configVersion: LEGACY_CONFIG_VERSION,
    items: [legacyRequest()],
    variables: [{ id: "v1", name: "base_url", value: "https://api.test", enabled: true }]
  };
}

function firstRequest(config: AppConfig): SavedRequest {
  const item = config.items[0];
  if (item.kind !== "request") throw new Error("expected a request");
  return item;
}

describe("migrateTemplateText", () => {
  it("rewrites every occurrence in a field", () => {
    expect(migrateTemplateText("${a}/x/${b}")).toBe("{{a}}/x/{{b}}");
  });

  it("is idempotent", () => {
    const once = migrateTemplateText("${a}/x/${b}");
    expect(migrateTemplateText(once)).toBe(once);
  });

  it("leaves text without templates alone", () => {
    expect(migrateTemplateText("plain $ text {braces}")).toBe("plain $ text {braces}");
  });
});

describe("needsVariableSyntaxMigration", () => {
  it("treats a missing version as legacy", () => {
    expect(needsVariableSyntaxMigration(undefined)).toBe(true);
  });

  it("skips configs already on the current version", () => {
    expect(needsVariableSyntaxMigration(CONFIG_VERSION)).toBe(false);
  });
});

describe("migrateVariableSyntax", () => {
  it("rewrites every field that applyVariables resolves", () => {
    const request = firstRequest(migrateVariableSyntax(legacyConfig()));

    expect(request.url).toBe("{{base_url}}/auth/login");
    expect(request.urlHash).toBe("{{fragment}}");
    expect(request.queryParams[0].key).toBe("tenant_{{env}}");
    expect(request.queryParams[0].value).toBe("{{tenant}}");
    expect(request.headers[0].value).toBe("{{trace_id}}");
    expect(request.body).toBe('{"username": "{{username}}"}');
    expect(request.graphqlVariables).toBe('{"id": "{{id}}"}');
    expect(request.form[0].value).toBe("{{form_value}}");
    expect(request.auth.bearerToken).toBe("{{token}}");
  });

  it("migrates every auth text field", () => {
    const config = legacyConfig();
    const request = firstRequest(config);
    request.auth = {
      type: "basic",
      basicUsername: "${user}",
      basicPassword: "${pass}",
      basicToken: "${creds}",
      apiKeyName: "${key_name}",
      apiKeyValue: "${key_value}"
    };

    const migrated = firstRequest(migrateVariableSyntax(config)).auth;
    expect(migrated.basicUsername).toBe("{{user}}");
    expect(migrated.basicPassword).toBe("{{pass}}");
    expect(migrated.basicToken).toBe("{{creds}}");
    expect(migrated.apiKeyName).toBe("{{key_name}}");
    expect(migrated.apiKeyValue).toBe("{{key_value}}");
  });

  it("leaves variable values alone — there is no nested resolution", () => {
    const config = legacyConfig();
    config.variables = [{ id: "v1", name: "api_url", value: "${base_url}/api", enabled: true }];

    expect(migrateVariableSyntax(config).variables[0].value).toBe("${base_url}/api");
  });

  it("leaves extractorCode alone — its ${} are JavaScript template literals", () => {
    const config = legacyConfig();
    config.functions = [
      {
        id: "f1",
        name: "Login",
        code: "",
        functionType: "http",
        method: "POST",
        url: "${base_url}/auth",
        queryParams: [],
        headers: [],
        bodyMode: "none",
        rawType: "json",
        body: "",
        form: [],
        auth: { type: "none" },
        extractorCode: "return `Bearer ${response.body.token}`;"
      }
    ];

    const migrated = migrateVariableSyntax(config).functions[0];
    expect(migrated.url).toBe("{{base_url}}/auth");
    expect(migrated.extractorCode).toBe("return `Bearer ${response.body.token}`;");
  });

  it("leaves folders untouched", () => {
    const config = legacyConfig();
    config.items = [{ id: "d1", kind: "folder", parentId: "/", title: "${not_a_template}", expanded: true }];

    expect(migrateVariableSyntax(config).items[0].title).toBe("${not_a_template}");
  });
});

describe("normalizeConfig", () => {
  it("upgrades a legacy config and stamps the current version", () => {
    const normalized = normalizeConfig(legacyConfig());

    expect(normalized.configVersion).toBe(CONFIG_VERSION);
    expect(firstRequest(normalized).url).toBe("{{base_url}}/auth/login");
  });

  it("does not re-run on a config already at the current version", () => {
    const config = { ...legacyConfig(), configVersion: CONFIG_VERSION };

    expect(firstRequest(normalizeConfig(config)).url).toBe("${base_url}/auth/login");
  });

  it("is idempotent across repeated loads", () => {
    const once = normalizeConfig(legacyConfig());
    const twice = normalizeConfig(once);

    expect(firstRequest(twice).url).toBe(firstRequest(once).url);
  });
});
