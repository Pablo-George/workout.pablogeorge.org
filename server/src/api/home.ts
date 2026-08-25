import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { handler, sendData } from "../lib/respond.js";
import { buildChartDatasets, countLogs } from "../services/workoutService.js";

const router = Router();

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

/**
 * The Home tab: headline stats plus the three charts.
 *
 * Deliberately not one aggregate /api/home for all five tabs — the EJS route it
 * replaces fed 19 template variables from ~15 queries, which meant opening any
 * tab paid for all of them. Each tab now fetches its own slice.
 */
router.get(
  "/summary",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);

    const [totalSessions, chartDatasets, latestWeight, calHistory, weightHistory] =
      await Promise.all([
        countLogs(userId),
        buildChartDatasets(userId),
        prisma.bodyWeightLog.findFirst({ where: { userId }, orderBy: { loggedOn: "desc" } }),
        prisma.calorieEntry.findMany({
          where: { userId, loggedOn: { gte: isoDaysAgo(29) } },
          orderBy: { loggedOn: "asc" },
          select: { loggedOn: true, calories: true },
        }),
        prisma.bodyWeightLog.findMany({
          where: { userId, loggedOn: { gte: isoDaysAgo(89) } },
          orderBy: { loggedOn: "asc" },
          select: { loggedOn: true, weightLbs: true },
        }),
      ]);

    const calByDay = new Map<string, number>();
    for (const entry of calHistory) {
      calByDay.set(entry.loggedOn, (calByDay.get(entry.loggedOn) ?? 0) + entry.calories);
    }

    sendData(res, {
      totalSessions,
      currentWeight: latestWeight?.weightLbs ?? null,
      trainingMaxChart: chartDatasets,
      calorieChart: [...calByDay].map(([date, total]) => ({ date, total })),
      weightChart: weightHistory.map((w) => ({ date: w.loggedOn, weight: w.weightLbs })),
    });
  }),
);

export default router;
