import { Router } from "express";
import { ensureAuth } from "../middleware/auth.js";
import { prisma } from "../app.js";

const router = Router();

function isAdmin(req: any) {
  const adminId = process.env.ADMIN_USER_ID;
  return adminId && req.user?.userId === adminId;
}

router.get("/admin", ensureAuth, async (req, res) => {
  if (!isAdmin(req)) return res.redirect("/");

  const logs = await prisma.trainingMaxLog.findMany({
    orderBy: [{ userId: "asc" }, { liftId: "asc" }, { loggedOn: "asc" }],
    include: { lift: true },
  });

  const profiles = await prisma.userProfile.findMany();
  const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p.displayName]));

  // Group by user → lift
  const byUser = new Map<string, { liftName: string; entries: typeof logs }[]>();
  for (const log of logs) {
    if (!byUser.has(log.userId)) byUser.set(log.userId, []);
    const userLifts = byUser.get(log.userId)!;
    let liftGroup = userLifts.find((g) => g.liftName === log.lift.name);
    if (!liftGroup) {
      liftGroup = { liftName: log.lift.name, entries: [] };
      userLifts.push(liftGroup);
    }
    liftGroup.entries.push(log);
  }

  const users = [...byUser.entries()].map(([userId, lifts]) => ({
    userId,
    displayName: profileMap[userId] ?? userId,
    lifts,
  }));

  res.render("admin", { users, totalLogs: logs.length });
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

export default router;
