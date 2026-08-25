import type { ApiResponse, HeaderPair } from "../types";

/** Base64 of the `%PDF-` file signature — how a PDF looks once `body_is_base64` is set. */
const PDF_BASE64_PREFIX = "JVBERi0";

const PDF_MIME_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/acrobat",
  "application/vnd.pdf",
  "text/pdf"
]);

/** Extension the save dialog defaults to, per response Content-Type. */
const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/x-pdf": "pdf",
  "application/acrobat": "pdf",
  "application/vnd.pdf": "pdf",
  "text/pdf": "pdf",
  "application/json": "json",
  "application/xml": "xml",
  "text/xml": "xml",
  "text/html": "html",
  "text/csv": "csv",
  "text/plain": "txt",
  "application/zip": "zip",
  "application/gzip": "gz",
  "application/x-tar": "tar",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "video/mp4": "mp4"
};

/** Content-Type without parameters (`application/pdf; charset=binary` → `application/pdf`). */
export function responseMimeType(headers: HeaderPair[]): string {
  const raw = headers.find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";
  return raw.split(";")[0].trim().toLowerCase();
}

/** True when the body can be handed to the webview's built-in PDF viewer. */
export function isPdfResponse(response: Pick<ApiResponse, "body" | "body_is_base64" | "headers">): boolean {
  if (PDF_MIME_TYPES.has(responseMimeType(response.headers))) return true;
  return response.body_is_base64
    ? response.body.startsWith(PDF_BASE64_PREFIX)
    : response.body.startsWith("%PDF-");
}

/** Base64 prefixes of the usual image file signatures, for servers that answer `octet-stream`. */
const IMAGE_BASE64_PREFIXES = [
  "iVBORw0KGgo", // PNG
  "/9j/", // JPEG
  "R0lGOD", // GIF
  "Qk" // BMP
];

/**
 * True when the body should be shown as a picture. SVG is deliberately excluded:
 * it is UTF-8 text and the XML source is what an API client wants to read.
 */
export function isImageResponse(response: Pick<ApiResponse, "body" | "body_is_base64" | "headers">): boolean {
  const mime = responseMimeType(response.headers);
  if (mime === "image/svg+xml") return false;
  if (mime.startsWith("image/")) return true;
  if (!response.body_is_base64) return false;
  return IMAGE_BASE64_PREFIXES.some((prefix) => response.body.startsWith(prefix));
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Raw response bytes. Text bodies round-trip losslessly because Rust only keeps
 * them as text when they were valid UTF-8 (`decode_response_body`).
 * Returns `null` when a base64 body is corrupt.
 */
export function responseBodyBytes(
  response: Pick<ApiResponse, "body" | "body_is_base64">
): Uint8Array<ArrayBuffer> | null {
  if (!response.body_is_base64) return new TextEncoder().encode(response.body);
  return base64ToBytes(response.body);
}

/** Strip path separators, control characters and anything Windows rejects in a name. */
function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 120).trim();
}

/** File name advertised by `Content-Disposition`, `null` when absent or unusable. */
export function contentDispositionFileName(headers: HeaderPair[]): string | null {
  const value = headers.find(([key]) => key.toLowerCase() === "content-disposition")?.[1];
  if (!value) return null;

  const extended = /filename\*\s*=\s*([^;]+)/i.exec(value)?.[1]?.trim();
  if (extended) {
    const encoded = extended.includes("''") ? (extended.split("''").pop() ?? "") : extended;
    try {
      const name = sanitizeFileName(decodeURIComponent(encoded));
      if (name) return name;
    } catch {
      /* malformed percent-encoding — fall through to the plain filename */
    }
  }

  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(value);
  if (plain) {
    const name = sanitizeFileName(plain[2] ?? plain[1]);
    if (name) return name;
  }
  return null;
}

/** Extension the save dialog should default to (never empty). */
export function responseFileExtension(headers: HeaderPair[]): string {
  return MIME_EXTENSIONS[responseMimeType(headers)] ?? "bin";
}

/** Default name for the save dialog: what the server suggested, else `response.<ext>`. */
export function suggestedResponseFileName(response: Pick<ApiResponse, "headers">): string {
  return contentDispositionFileName(response.headers) ?? `response.${responseFileExtension(response.headers)}`;
}
