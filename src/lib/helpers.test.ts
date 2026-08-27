import { describe, expect, it } from "vitest";
import {
  coerceArgument,
  defaultHelper,
  FALLBACK_HELPER_NAME,
  helperCallArgs,
  helperCallCode,
  helperNameProblem,
  helperSignatureText,
  identifierFromTitle,
  parseSampleResponse,
  responseHelper,
  responseSampleJson,
  typedSignatureText,
  uniqueHelperName
} from "./helpers";
import type { ApiResponse, Helper } from "../types";

function helper(id: string, name: string, params: string[] = []): Helper {
  return { id, name, params, code: `function ${name}(${params.join(", ")}) { return 1; }` };
}

describe("helperNameProblem", () => {
  const library = [helper("a", "cuil"), helper("b", "pad")];

  it("flags two entries declaring the same function name", () => {
    expect(helperNameProblem("cuil", library, "new")).toBe("duplicate");
  });

  it("does not consider the entry being edited its own duplicate", () => {
    expect(helperNameProblem("cuil", library, "a")).toBeNull();
  });

  it("flags source that declared nothing to name", () => {
    expect(helperNameProblem("", library, "new")).toBe("empty");
  });
});

describe("helperCallCode", () => {
  it("looks the function up by string rather than splicing it into code", () => {
    expect(helperCallCode("cuil")).toBe('return lib["cuil"](...args);');
  });

  it("escapes a name instead of letting it break out of the string", () => {
    expect(helperCallCode('a"); evil(); //')).toBe('return lib["a\\"); evil(); //"](...args);');
  });
});

describe("helperCallArgs", () => {
  it("gives one argument per declared parameter", () => {
    expect(helperCallArgs(["dni", "gender"], ["123"])).toEqual(["123", ""]);
  });

  it("drops values left over from a parameter that was removed", () => {
    expect(helperCallArgs(["dni"], ["123", "F"])).toEqual(["123"]);
  });
});

describe("helperSignatureText", () => {
  it("reads like the declaration it came from", () => {
    expect(helperSignatureText("cuil", ["dni", "gender"])).toBe("cuil(dni, gender)");
  });

  it("keeps the parentheses when there are no parameters", () => {
    expect(helperSignatureText("now", [])).toBe("now()");
  });
});

describe("defaultHelper", () => {
  it("starts as a real declaration, matching its cached signature", () => {
    const fresh = defaultHelper("new", "myFunction");
    expect(fresh.name).toBe("myFunction");
    expect(fresh.code).toContain(`function ${fresh.name}(${fresh.params.join(", ")})`);
  });
});

describe("identifierFromTitle", () => {
  it("camel-cases the words of a request title", () => {
    expect(identifierFromTitle("Get user by id")).toBe("getUserById");
  });

  it("leaves a title that is already camelCase alone", () => {
    expect(identifierFromTitle("getUserById")).toBe("getUserById");
  });

  it("folds accents instead of dropping the letters", () => {
    expect(identifierFromTitle("Búsqueda de artículos")).toBe("busquedaDeArticulos");
  });

  it("drops punctuation and path separators", () => {
    expect(identifierFromTitle("GET /api/v1/users")).toBe("getApiV1Users");
  });

  it("gives nothing back when a title leaves no identifier", () => {
    expect(identifierFromTitle("   ")).toBe("");
    expect(identifierFromTitle("¿?¡!")).toBe("");
  });

  it("refuses a name that would start with a digit", () => {
    expect(identifierFromTitle("404 handler")).toBe("");
  });
});

describe("uniqueHelperName", () => {
  const library = [helper("a", "example"), helper("b", "example2")];

  it("keeps a name nothing is using", () => {
    expect(uniqueHelperName("fresh", library)).toBe("fresh");
  });

  it("counts past the names already taken", () => {
    expect(uniqueHelperName("example", library)).toBe("example3");
  });

  it("treats a clash as a clash regardless of case", () => {
    // "example" and "example2" are both taken, whatever case they are written in.
    expect(uniqueHelperName("EXAMPLE", library)).toBe("EXAMPLE3");
  });

  it("falls back when there is no base to start from", () => {
    expect(uniqueHelperName("", [])).toBe(FALLBACK_HELPER_NAME);
  });
});

function response(body: string, headers: [string, string][] = []): ApiResponse {
  return {
    status: 201,
    status_text: "Created",
    duration_ms: 5,
    headers,
    body,
    body_is_base64: false,
    body_size: body.length
  };
}

describe("responseSampleJson", () => {
  it("shows the whole response, with the body as structure rather than an escaped string", () => {
    const sample = JSON.parse(responseSampleJson(response('{"id":7}')));
    expect(sample).toEqual({ status: 201, headers: {}, body: { id: 7 } });
  });

  it("leaves a body that is not JSON as text", () => {
    const sample = JSON.parse(responseSampleJson(response("plain text")));
    expect(sample.body).toBe("plain text");
  });

  it("turns the header list into the lookup a script reads, joining repeats", () => {
    const sample = JSON.parse(
      responseSampleJson(
        response("{}", [
          ["set-cookie", "a=1"],
          ["set-cookie", "b=2"],
          ["content-type", "application/json"]
        ])
      )
    );
    expect(sample.headers).toEqual({
      "set-cookie": "a=1, b=2",
      "content-type": "application/json"
    });
  });

  it("is pretty-printed, because a person has to read and edit it", () => {
    const json = responseSampleJson(response('{"id":7}'));
    // A newline followed by indentation: the pane shows structure, not one long line.
    expect(json.includes(String.fromCharCode(10) + "  ")).toBe(true);
  });
});

describe("parseSampleResponse", () => {
  it("hands back whatever the pane holds", () => {
    const parsed = parseSampleResponse('{"status":200,"body":{"id":7}}');
    expect(parsed).toEqual({ ok: true, value: { status: 200, body: { id: 7 } } });
  });

  it("reports a pane the user has broken rather than passing along a string", () => {
    expect(parseSampleResponse("{ not json")).toEqual({ ok: false, error: "invalid-json" });
  });
});

describe("typedSignatureText", () => {
  it("shows the types the source declared", () => {
    expect(
      typedSignatureText("cuil", [
        { name: "dni", type: "string" },
        { name: "monto", type: "number" }
      ])
    ).toBe("cuil(dni: string, monto: number)");
  });

  it("leaves an unannotated parameter bare rather than inventing a type for it", () => {
    expect(typedSignatureText("f", [{ name: "a", type: null }, { name: "b", type: "number" }])).toBe(
      "f(a, b: number)"
    );
  });
});

describe("coerceArgument", () => {
  it("leaves an unannotated argument as the string it was typed as", () => {
    // The DNI case: nothing guesses that digits mean a number.
    expect(coerceArgument("12345678", null)).toEqual({ ok: true, value: "12345678" });
    expect(coerceArgument("12345678", "string")).toEqual({ ok: true, value: "12345678" });
  });

  it("turns a number parameter into a number", () => {
    expect(coerceArgument("42", "number")).toEqual({ ok: true, value: 42 });
    expect(coerceArgument("3.5", "number")).toEqual({ ok: true, value: 3.5 });
  });

  it("reports text a number parameter cannot accept", () => {
    expect(coerceArgument("abc", "number")).toEqual({ ok: false, error: "not-a-number" });
  });

  it("reads a boolean from the checkbox", () => {
    expect(coerceArgument("true", "boolean")).toEqual({ ok: true, value: true });
    expect(coerceArgument("false", "boolean")).toEqual({ ok: true, value: false });
  });

  it("parses object and array parameters", () => {
    expect(coerceArgument('{"a":1}', "object")).toEqual({ ok: true, value: { a: 1 } });
    expect(coerceArgument("[1,2]", "array")).toEqual({ ok: true, value: [1, 2] });
  });

  it("refuses JSON of the wrong shape, not just JSON that will not parse", () => {
    expect(coerceArgument("[1,2]", "object")).toEqual({ ok: false, error: "invalid-json" });
    expect(coerceArgument('{"a":1}', "array")).toEqual({ ok: false, error: "invalid-json" });
    expect(coerceArgument("{ not json", "object")).toEqual({ ok: false, error: "invalid-json" });
  });

  it("leaves a blank typed field undefined, so a declared default applies", () => {
    expect(coerceArgument("", "number")).toEqual({ ok: true, value: undefined });
    expect(coerceArgument("   ", "object")).toEqual({ ok: true, value: undefined });
  });

  it("keeps a blank string parameter a blank string", () => {
    expect(coerceArgument("", "string")).toEqual({ ok: true, value: "" });
  });
});

describe("responseHelper", () => {
  it("declares a function whose first parameter is called response", () => {
    const built = responseHelper("h", "example");
    expect(built.params).toEqual(["response"]);
    expect(built.code).toContain("function example(response)");
    expect(built.code).toContain("return response.body;");
    // Seeded already annotated, so a by-hand run offers a JSON box rather than a text field.
    expect(built.code).toContain("@param {object} response");
  });

  it("carries no sample: what it is tried against is scaffolding, held outside the function", () => {
    expect(Object.keys(responseHelper("h", "example"))).toEqual(["id", "name", "params", "code"]);
  });
});
