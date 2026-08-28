/**
 * RFC 7617 Basic credentials: `user:password` encoded as base64.
 *
 * `btoa`/`atob` only handle latin1, so a password with `ñ`, `é` or any non-ASCII
 * character throws `InvalidCharacterError`. Encode through UTF-8 bytes instead —
 * that is what curl, Postman and Insomnia put on the wire.
 */

export function encodeBasicCredentials(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Strip whitespace/newlines a pasted token may carry; base64 never contains any. */
export function compactBase64(token: string): string {
  return token.replace(/\s+/g, "");
}

export function decodeBasicCredentials(
  token: string
): { username: string; password: string } | null {
  const compact = compactBase64(token);
  if (!compact) return null;
  let binary: string;
  try {
    binary = atob(compact);
  } catch {
    return null;
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const decoded = new TextDecoder().decode(bytes);
  const colon = decoded.indexOf(":");
  // Without a colon it is not a credential pair — keep it as an opaque token.
  if (colon < 0) return null;
  return { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}
