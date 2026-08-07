import { prisma } from "../db.js";
import { generateGuideImage } from "./guideService.js";

/**
 * Runs guide generation out of band.
 *
 * Today the app is a single long-lived container, so "out of band" means after
 * the response is flushed. On Lambda this becomes an async Invoke of a second
 * function with a longer timeout; the caller and the polling contract stay the
 * same either way.
 */
export function enqueueGuide(liftName: string): void {
  setImmediate(() => {
    void runGuideGeneration(liftName);
  });
}

export async function runGuideGeneration(liftName: string): Promise<void> {
  const key = liftName.trim().toLowerCase();
  try {
    const imageUrl = await generateGuideImage(liftName.trim());
    await prisma.exerciseGuide.updateMany({
      where: { liftName: key },
      data: { imageUrl, status: "READY", error: null },
    });
  } catch (err) {
    console.error(`[guides] generation failed for ${key}:`, err);
    // updateMany, not update: an admin cache clear may have deleted the row
    // while this was running, and a P2025 inside the error path would be
    // an unhandled rejection.
    await prisma.exerciseGuide.updateMany({
      where: { liftName: key },
      data: { status: "FAILED", error: String(err instanceof Error ? err.message : err).slice(0, 500) },
    });
  }
}
