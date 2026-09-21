export function authorizeAvatarUpdate(actorId, targetId) {
  if (!actorId || actorId !== targetId) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true };
}
