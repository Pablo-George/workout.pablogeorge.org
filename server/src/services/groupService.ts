import { prisma } from "../db.js";
import { getAuxLifts } from "./auxLiftService.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Share code. The alphabet omits I, O, 0 and 1 to stay readable aloud. */
function generateCode(): string {
  return Array.from(
    { length: 6 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join("");
}

export async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const clash = await prisma.groupSession.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  throw new Error("Could not allocate a unique session code");
}

/**
 * Aux lifts are AI-generated per lift and training max, then cached. A failure
 * to generate is not fatal — the session still works, just without accessories.
 */
export async function ensureAuxLifts(
  userId: string,
  liftId: number,
  liftName: string,
  trainingMax: number,
) {
  const saved = await prisma.auxLift.findMany({
    where: { userId, liftId },
    orderBy: { displayOrder: "asc" },
  });
  if (saved.length > 0) return saved;

  try {
    const generated = await getAuxLifts({ name: liftName }, trainingMax);
    await prisma.auxLift.createMany({
      data: generated.map((a) => ({
        userId,
        liftId,
        name: a.name,
        description: a.description,
        setsReps: a.setsReps,
        weightRecommendation: a.weightRecommendation,
        youtubeSearchUrl: a.youtubeSearchUrl,
        displayOrder: a.displayOrder,
      })),
    });
    return prisma.auxLift.findMany({ where: { userId, liftId }, orderBy: { displayOrder: "asc" } });
  } catch (err) {
    console.error("[group] aux lift generation failed:", err);
    return [];
  }
}
