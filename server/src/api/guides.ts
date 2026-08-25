import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest, handler, sendData } from "../lib/respond.js";
import { enqueueGuide } from "../services/guideQueue.js";

const router = Router();

/** A PENDING row older than this is assumed dead and retried. */
const STALE_AFTER_MS = 3 * 60_000;

function cacheKey(raw: string): string {
  const name = raw.trim();
  if (!name) throw badRequest("Lift name is required");
  return name.toLowerCase();
}

/**
 * Ask for a guide. Returns immediately: READY with the image if it is already
 * cached, otherwise PENDING while generation runs in the background.
 */
router.post(
  "/:liftName",
  requireAuth,
  handler(async (req, res) => {
    const liftName = req.params.liftName.trim();
    const key = cacheKey(liftName);

    const existing = await prisma.exerciseGuide.findUnique({ where: { liftName: key } });

    if (existing?.status === "READY" && existing.imageUrl) {
      sendData(res, { status: "READY", imageUrl: existing.imageUrl });
      return;
    }

    if (!existing) {
      try {
        await prisma.exerciseGuide.create({ data: { liftName: key, status: "PENDING" } });
      } catch (err) {
        // Unique violation: another request won the race and owns generation.
        if ((err as { code?: string }).code === "P2002") {
          sendData(res, { status: "PENDING" }, 202);
          return;
        }
        throw err;
      }
    } else if (
      existing.status === "FAILED" ||
      Date.now() - existing.updatedAt.getTime() > STALE_AFTER_MS
    ) {
      await prisma.exerciseGuide.update({
        where: { liftName: key },
        data: { status: "PENDING", error: null },
      });
    } else {
      // Someone else is already generating this one.
      sendData(res, { status: "PENDING" }, 202);
      return;
    }

    enqueueGuide(liftName);
    sendData(res, { status: "PENDING" }, 202);
  }),
);

/** Poll target. */
router.get(
  "/:liftName",
  requireAuth,
  handler(async (req, res) => {
    const guide = await prisma.exerciseGuide.findUnique({
      where: { liftName: cacheKey(req.params.liftName) },
    });

    if (!guide) {
      sendData(res, { status: "NONE" });
      return;
    }
    sendData(res, {
      status: guide.status,
      imageUrl: guide.imageUrl,
      error: guide.status === "FAILED" ? guide.error : null,
    });
  }),
);

export default router;
