import { Router } from "express";
import { prisma } from "../db.js";
import { apiAuth, currentUser } from "../middleware/auth.js";
import { badRequest, handler, intParam, notFound, sendData } from "../lib/respond.js";
import { resolveLocalDate } from "../lib/dates.js";

const router = Router();
router.use(apiAuth);

function withPace(run: { distanceMi: number; durationSec: number }) {
  return { ...run, paceSecPerMi: run.distanceMi > 0 ? run.durationSec / run.distanceMi : null };
}

router.get(
  "/",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const runs = await prisma.runLog.findMany({
      where: { userId },
      orderBy: [{ completedOn: "desc" }, { id: "desc" }],
      take: 30,
    });
    sendData(res, runs.map(withPace));
  })
);

router.post(
  "/",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const distanceMi = Number(req.body?.distanceMi);
    const durationSec = Number(req.body?.durationSec);
    if (!Number.isFinite(distanceMi) || distanceMi <= 0 || distanceMi > 500) throw badRequest("Invalid distance");
    if (!Number.isInteger(durationSec) || durationSec <= 0 || durationSec > 86400) throw badRequest("Invalid duration");

    const completedOn = resolveLocalDate(req.body?.loggedOn);
    const run = await prisma.runLog.create({
      data: { userId, distanceMi, durationSec, completedOn, source: req.body?.source === "APPLE_HEALTH" ? "APPLE_HEALTH" : "MANUAL" },
    });
    sendData(res, withPace(run), 201);
  })
);

router.delete(
  "/:id",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const id = intParam(req.params.id);
    const run = await prisma.runLog.findFirst({ where: { id, userId } });
    if (!run) throw notFound("Run not found");
    await prisma.runLog.delete({ where: { id } });
    sendData(res, { ok: true });
  })
);

router.get(
  "/chart",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    const runs = await prisma.runLog.findMany({
      where: { userId, completedOn: { gte: thirtyDaysAgo.toISOString().split("T")[0] } },
      orderBy: { completedOn: "asc" },
    });
    const milesByDay: Record<string, number> = {};
    for (const run of runs) milesByDay[run.completedOn] = (milesByDay[run.completedOn] ?? 0) + run.distanceMi;
    sendData(res, Object.entries(milesByDay).map(([date, miles]) => ({ date, miles })));
  })
);

export default router;
