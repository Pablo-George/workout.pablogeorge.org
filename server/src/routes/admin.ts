import { Router } from "express";
import { ensureAuth } from "../middleware/auth.js";
import { prisma } from "../app.js";

const router = Router();

function isAdmin(req: any) {
  const adminEmail = process.env.ADMIN_EMAIL;
  return adminEmail && req.user?.userId === adminEmail;
}

router.get("/admin", ensureAuth, async (req, res) => {
  if (!isAdmin(req)) return res.redirect("/");

  const [profiles, tmLogs, tmConfigs, weightLogs, calEntries] = await Promise.all([
    prisma.userProfile.findMany(),
    prisma.trainingMaxLog.findMany({
      orderBy: [{ userId: "asc" }, { liftId: "asc" }, { loggedOn: "asc" }],
      include: { lift: true },
    }),
    prisma.userLiftConfig.findMany({ include: { lift: true }, orderBy: { liftId: "asc" } }),
    prisma.bodyWeightLog.findMany({ orderBy: [{ userId: "asc" }, { loggedOn: "desc" }] }),
    prisma.calorieEntry.findMany({ orderBy: [{ userId: "asc" }, { createdAt: "desc" }] }),
  ]);

  const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p.displayName]));

  const tmLogsByUser = new Map<string, { liftName: string; entries: typeof tmLogs }[]>();
  for (const log of tmLogs) {
    if (!tmLogsByUser.has(log.userId)) tmLogsByUser.set(log.userId, []);
    const userLifts = tmLogsByUser.get(log.userId)!;
    let liftGroup = userLifts.find((g) => g.liftName === log.lift.name);
    if (!liftGroup) {
      liftGroup = { liftName: log.lift.name, entries: [] };
      userLifts.push(liftGroup);
    }
    liftGroup.entries.push(log);
  }

  const users = profiles.map((p) => ({
    userId: p.userId,
    displayName: p.displayName,
    tmLogs: tmLogsByUser.get(p.userId) ?? [],
    tmConfigs: tmConfigs.filter((c) => c.userId === p.userId),
    weightLogs: weightLogs.filter((w) => w.userId === p.userId).slice(0, 15),
    calEntries: calEntries.filter((c) => c.userId === p.userId).slice(0, 30),
  }));

  res.render("admin", { users, totalLogs: tmLogs.length });
});

router.post("/admin/tm-config/update/:id", ensureAuth, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
  const id = parseInt(req.params.id);
  const data: any = {};
  if (req.body.trainingMax !== undefined) data.trainingMax = parseFloat(req.body.trainingMax);
  if (req.body.currentWeek !== undefined) data.currentWeek = parseInt(req.body.currentWeek);
  await prisma.userLiftConfig.update({ where: { id }, data });
  res.json({ ok: true });
});

router.post("/admin/weight/update/:id", ensureAuth, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
  const weightLbs = parseFloat(req.body.weightLbs);
  if (isNaN(weightLbs)) return res.status(400).json({ error: "Invalid" });
  await prisma.bodyWeightLog.update({ where: { id: parseInt(req.params.id) }, data: { weightLbs } });
  res.json({ ok: true });
});

router.post("/admin/weight/delete/:id", ensureAuth, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
  await prisma.bodyWeightLog.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ ok: true });
});

router.post("/admin/cals/update/:id", ensureAuth, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
  const data: any = {};
  if (req.body.calories !== undefined) data.calories = parseInt(req.body.calories);
  if (req.body.description !== undefined) data.description = req.body.description.trim();
  await prisma.calorieEntry.update({ where: { id: parseInt(req.params.id) }, data });
  res.json({ ok: true });
});

router.post("/admin/cals/delete/:id", ensureAuth, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
  await prisma.calorieEntry.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ ok: true });
});

router.post("/admin/tm-log/delete/:id", ensureAuth, async (req, res) => {
  if (!isAdmin(req)) return res.redirect("/");
  await prisma.trainingMaxLog.delete({ where: { id: parseInt(req.params.id) } });
  res.redirect("/admin");
});

router.post("/admin/tm-log/delete-user/:userId", ensureAuth, async (req, res) => {
  if (!isAdmin(req)) return res.redirect("/");
  await prisma.trainingMaxLog.deleteMany({ where: { userId: req.params.userId } });
  res.redirect("/admin");
});

router.post("/admin/guides/clear", ensureAuth, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
  await prisma.exerciseGuide.deleteMany({});
  res.json({ ok: true });
});

export default router;
