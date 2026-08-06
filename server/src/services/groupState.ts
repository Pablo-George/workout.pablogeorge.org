const state = new Map<number, Map<string, Set<string>>>();

export function toggleSet(sessionId: number, userId: string, key: string): boolean {
  if (!state.has(sessionId)) state.set(sessionId, new Map());
  const userMap = state.get(sessionId)!;
  if (!userMap.has(userId)) userMap.set(userId, new Set());
  const sets = userMap.get(userId)!;
  if (sets.has(key)) { sets.delete(key); return false; }
  sets.add(key); return true;
}

export function getAllCompleted(sessionId: number): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const userMap = state.get(sessionId);
  if (userMap) for (const [uid, s] of userMap) result[uid] = [...s];
  return result;
}

export function clearSession(sessionId: number) {
  state.delete(sessionId);
}
