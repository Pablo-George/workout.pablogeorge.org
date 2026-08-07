import { prisma } from "../db.js";

/**
 * Per-set completion state for a live group session.
 *
 * This was an in-process Map keyed by session id. That works for exactly one
 * server process: progress vanished on restart, and under more than one
 * instance each client would see a different partial view of the room. It is
 * now a table, so the behaviour is the same no matter what is serving.
 */

/** Flips one set for one member. Returns true if the set is now complete. */
export async function toggleSet(
  sessionId: number,
  userId: string,
  setKey: string,
): Promise<boolean> {
  const existing = await prisma.groupSetCompletion.findUnique({
    where: { sessionId_userId_setKey: { sessionId, userId, setKey } },
  });

  if (existing) {
    await prisma.groupSetCompletion.delete({ where: { id: existing.id } });
    return false;
  }

  await prisma.groupSetCompletion.create({ data: { sessionId, userId, setKey } });
  return true;
}

/** Completed set keys for every member, keyed by user id. */
export async function getAllCompleted(sessionId: number): Promise<Record<string, string[]>> {
  const rows = await prisma.groupSetCompletion.findMany({
    where: { sessionId },
    select: { userId: true, setKey: true },
  });

  const byUser: Record<string, string[]> = {};
  for (const row of rows) {
    (byUser[row.userId] ??= []).push(row.setKey);
  }
  return byUser;
}

export async function clearSession(sessionId: number): Promise<void> {
  await prisma.groupSetCompletion.deleteMany({ where: { sessionId } });
}

/** Used when a member leaves, so rejoining doesn't inherit stale checkmarks. */
export async function clearMember(sessionId: number, userId: string): Promise<void> {
  await prisma.groupSetCompletion.deleteMany({ where: { sessionId, userId } });
}
