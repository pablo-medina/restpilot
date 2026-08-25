import { describe, expect, it } from "vitest";
import {
  contentDispositionFileName,
  isImageResponse,
  isPdfResponse,
  responseBodyBytes,
  responseFileExtension,
  responseMimeType,
  suggestedResponseFileName
} from "./response-binary";
import type { HeaderPair } from "../types";

function headers(...pairs: HeaderPair[]): HeaderPair[] {
  return pairs;
}

describe("responseMimeType", () => {
  it("drops parameters and is case-insensitive on the header name", () => {
    expect(responseMimeType(headers(["Content-Type", "Application/PDF; charset=binary"]))).toBe("application/pdf");
  });

  it("returns an empty string when the header is missing", () => {
    expect(responseMimeType(headers(["x-other", "1"]))).toBe("");
  });
});

describe("isPdfResponse", () => {
  it("detects the content type", () => {
    const response = { body: "", body_is_base64: false, headers: headers(["content-type", "application/pdf"]) };
    expect(isPdfResponse(response)).toBe(true);
  });

  it("detects the %PDF- signature on a text body with no useful content type", () => {
    const response = {
      body: "%PDF-1.4\n1 0 obj",
      body_is_base64: false,
      headers: headers(["content-type", "application/octet-stream"])
    };
    expect(isPdfResponse(response)).toBe(true);
  });

  it("detects the signature through base64", () => {
    const body = btoa("%PDF-1.7 binary junk");
    expect(isPdfResponse({ body, body_is_base64: true, headers: [] })).toBe(true);
  });

  it("does not treat JSON as a PDF", () => {
    const response = { body: '{"ok":true}', body_is_base64: false, headers: headers(["content-type", "application/json"]) };
    expect(isPdfResponse(response)).toBe(false);
  });
});

describe("isImageResponse", () => {
  it("detects any image content type", () => {
    for (const mime of ["image/png", "image/jpeg", "image/gif", "image/webp", "IMAGE/AVIF"]) {
      expect(isImageResponse({ body: "", body_is_base64: true, headers: headers(["content-type", mime]) })).toBe(true);
    }
  });

  it("leaves SVG to the XML viewer", () => {
    const response = {
      body: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
      body_is_base64: false,
      headers: headers(["content-type", "image/svg+xml"])
    };
    expect(isImageResponse(response)).toBe(false);
  });

  it("detects a PNG signature behind an octet-stream content type", () => {
    const response = {
      body: btoa(String.fromCharCode(0x89) + "PNG" + String.fromCharCode(13, 10, 26, 10) + " rest"),
      body_is_base64: true,
      headers: headers(["content-type", "application/octet-stream"])
    };
    expect(isImageResponse(response)).toBe(true);
  });

  it("does not claim text bodies", () => {
    const response = {
      body: '{"ok":true}',
      body_is_base64: false,
      headers: headers(["content-type", "application/json"])
    };
    expect(isImageResponse(response)).toBe(false);
  });

  it("does not claim a PDF", () => {
    const response = { body: btoa("%PDF-1.7"), body_is_base64: true, headers: headers(["content-type", "application/pdf"]) };
    expect(isImageResponse(response)).toBe(false);
  });
});

describe("responseBodyBytes", () => {
  it("encodes a text body as UTF-8", () => {
    const bytes = responseBodyBytes({ body: "café", body_is_base64: false });
    expect(Array.from(bytes ?? [])).toEqual([0x63, 0x61, 0x66, 0xc3, 0xa9]);
  });

  it("decodes a base64 body back to the original bytes", () => {
    const bytes = responseBodyBytes({ body: "/9j/4AAQ", body_is_base64: true });
    expect(Array.from(bytes ?? [])).toEqual([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  });

  it("returns null for a corrupt base64 body", () => {
    expect(responseBodyBytes({ body: "not valid base64!!", body_is_base64: true })).toBeNull();
  });
});

describe("contentDispositionFileName", () => {
  it("reads a quoted filename", () => {
    expect(contentDispositionFileName(headers(["content-disposition", 'attachment; filename="report.pdf"']))).toBe(
      "report.pdf"
    );
  });

  it("reads an unquoted filename", () => {
    expect(contentDispositionFileName(headers(["Content-Disposition", "attachment; filename=report.pdf"]))).toBe(
      "report.pdf"
    );
  });

  it("prefers the RFC 5987 extended filename", () => {
    const value = "attachment; filename=\"fallback.pdf\"; filename*=UTF-8''informe%20anual.pdf";
    expect(contentDispositionFileName(headers(["content-disposition", value]))).toBe("informe anual.pdf");
  });

  it("strips path traversal and reserved characters", () => {
    const value = 'attachment; filename="../../etc/pas:swd.pdf"';
    expect(contentDispositionFileName(headers(["content-disposition", value]))).toBe("etcpasswd.pdf");
  });

  it("returns null when the header is absent", () => {
    expect(contentDispositionFileName(headers(["content-type", "application/pdf"]))).toBeNull();
  });
});

describe("suggestedResponseFileName", () => {
  it("falls back to the extension for the content type", () => {
    expect(suggestedResponseFileName({ headers: headers(["content-type", "application/pdf"]) })).toBe("response.pdf");
    expect(suggestedResponseFileName({ headers: headers(["content-type", "image/png"]) })).toBe("response.png");
  });

  it("falls back to .bin for unknown types", () => {
    expect(responseFileExtension(headers(["content-type", "application/x-thing"]))).toBe("bin");
    expect(suggestedResponseFileName({ headers: [] })).toBe("response.bin");
  });

  it("uses the server-provided name when there is one", () => {
    const value = 'attachment; filename="invoice-2026.pdf"';
    expect(suggestedResponseFileName({ headers: headers(["content-disposition", value]) })).toBe("invoice-2026.pdf");
  });
});
