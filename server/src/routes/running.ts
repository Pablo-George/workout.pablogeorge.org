import { Router, type Request } from "express";
import { ensureAuth } from "../middleware/auth.js";
import { prisma } from "../app.js";
import { resolveLocalDate } from "../lib/dates.js";

const isHTMX = (req: Request) => req.headers["hx-request"] === "true";

const router = Router();

async function recentRuns(userId: string) {
  const runs = await prisma.runLog.findMany({
    where: { userId },
    orderBy: [{ completedOn: "desc" }, { id: "desc" }],
    take: 30,
  });
  return runs.map(withPace);
}

function withPace(run: { id: number; distanceMi: number; durationSec: number; completedOn: string }) {
  const paceSecPerMi = run.distanceMi > 0 ? run.durationSec / run.distanceMi : null;
  return { ...run, paceSecPerMi };
}

router.post("/running/log", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const distanceMi = parseFloat(req.body.distanceMi as string);
  const durationSec = parseInt(req.body.durationSec as string);

  if (!isNaN(distanceMi) && distanceMi > 0 && distanceMi <= 500 && !isNaN(durationSec) && durationSec > 0 && durationSec <= 86400) {
    const completedOn = resolveLocalDate(req.body.loggedOn);
    await prisma.runLog.create({ data: { userId: user.userId, distanceMi, durationSec, completedOn } });
  }

  if (isHTMX(req)) {
    res.set("HX-Trigger", "charts-updated");
    const runs = await recentRuns(user.userId);
    return res.render("partials/run-list", { runs });
  }
  res.redirect("/#tab-workouts");
});

router.post("/running/log/delete", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const id = parseInt(req.body.id as string);

  await prisma.runLog.deleteMany({ where: { id, userId: user.userId } });

  if (isHTMX(req)) {
    res.set("HX-Trigger", "charts-updated");
    return res.send("");
  }
  res.redirect("/#tab-workouts");
});

export default router;
