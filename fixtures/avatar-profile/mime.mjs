export const ACCEPT = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_BYTES = 5 * 1024 * 1024;

export function validateAvatar(contentType, byteLength) {
  if (!ACCEPT.has(contentType)) return { ok: false, status: 422, error: "unsupported_type" };
  if (byteLength > MAX_BYTES) return { ok: false, status: 413, error: "too_large" };
  if (byteLength <= 0) return { ok: false, status: 422, error: "empty" };
  return { ok: true };
}
