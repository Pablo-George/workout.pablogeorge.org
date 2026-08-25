import { Router } from "express";
import { ensureAuth } from "../middleware/auth.js";
import { prisma } from "../app.js";
import { GROUP_WORKOUTS_ENABLED } from "../config/features.js";
import { buildPlan, getConfig, createConfig, completeWorkout } from "../services/workoutService.js";
import { getAuxLifts } from "../services/auxLiftService.js";
import { toggleSet, getAllCompleted, clearSession } from "../services/groupState.js";

const router = Router();

// Multiplayer surfaces only — solo sessions still work when the flag is off.
const rejectMultiplayer = (_req: any, res: any) => res.redirect("/#tab-workouts");

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function ensureAuxLifts(userId: string, liftId: number, liftName: string, trainingMax: number) {
  const saved = await prisma.auxLift.findMany({ where: { userId, liftId }, orderBy: { displayOrder: "asc" } });
  if (saved.length > 0) return saved;
  try {
    const generated = await getAuxLifts({ name: liftName }, trainingMax);
    await prisma.auxLift.createMany({
      data: generated.map((a) => ({
        userId, liftId, name: a.name, description: a.description,
        setsReps: a.setsReps, weightRecommendation: a.weightRecommendation,
        youtubeSearchUrl: a.youtubeSearchUrl, displayOrder: a.displayOrder,
      })),
    });
    return prisma.auxLift.findMany({ where: { userId, liftId }, orderBy: { displayOrder: "asc" } });
  } catch (err) {
    console.error("Failed to generate aux lifts:", err);
    return [];
  }
}

// List open friend sessions
router.get("/group/rooms", ensureAuth, async (req, res) => {
  if (!GROUP_WORKOUTS_ENABLED) return rejectMultiplayer(req, res);
  const user = req.user as any;
  const userId = user.userId;

  const sent = await prisma.friendship.findMany({ where: { requesterId: userId, status: "ACCEPTED" } });
  const received = await prisma.friendship.findMany({ where: { addresseeId: userId, status: "ACCEPTED" } });
  const friendIds = [
    ...sent.map((f) => f.addresseeId),
    ...received.map((f) => f.requesterId),
  ];

  let sessions: any[] = [];
  if (friendIds.length > 0) {
    const raw = await prisma.groupSession.findMany({
      where: { status: "ACTIVE", members: { some: { userId: { in: friendIds } } } },
      include: { members: { include: { lift: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (raw.length > 0) {
      const allUserIds = [...new Set(raw.flatMap((s) => s.members.map((m) => m.userId)))];
      const profiles = await prisma.userProfile.findMany({ where: { userId: { in: allUserIds } } });
      const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p]));
      sessions = raw.map((s) => ({
        id: s.id,
        members: s.members.map((m) => ({
          userId: m.userId,
          displayName: profileMap[m.userId]?.displayName ?? m.userId,
          pictureUrl: profileMap[m.userId]?.pictureUrl ?? null,
          liftName: m.lift.name,
        })),
      }));
    }
  }

  res.render("group-rooms", { user, sessions });
});

// Look up session by share code
router.get("/group/j/:code", ensureAuth, async (req, res) => {
  if (!GROUP_WORKOUTS_ENABLED) return rejectMultiplayer(req, res);
  const session = await prisma.groupSession.findUnique({
    where: { code: req.params.code.toUpperCase() },
  });
  if (!session || session.status !== "ACTIVE") return res.redirect("/");
  res.redirect(`/group/${session.id}`);
});

// Create a new group session as host
router.post("/group/create", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const userId = user.userId;
  const liftId = parseInt(req.body.liftId);

  const lift = await prisma.coreWorkout.findUnique({ where: { id: liftId } });
  if (!lift) return res.redirect("/");

  // Resume existing solo session for this user+lift if one is active
  const existingMember = await prisma.groupSessionMember.findFirst({
    where: { userId, liftId, session: { status: "ACTIVE" } },
    include: { session: { include: { members: true } } },
  });
  if (existingMember && existingMember.session.members.length === 1) {
    return res.redirect(`/group/${existingMember.sessionId}`);
  }

  let config = await getConfig(userId, liftId);
  if (!config) {
    const tm = parseFloat(req.body.trainingMax);
    if (isNaN(tm) || tm < 45) return res.redirect("/");
    await createConfig(userId, lift, tm);
    config = await getConfig(userId, liftId);
  }
  if (!config) return res.redirect("/");

  await ensureAuxLifts(userId, liftId, lift.name, config.trainingMax);

  let code = generateCode();
  let attempts = 0;
  while ((await prisma.groupSession.findUnique({ where: { code } })) && attempts++ < 10) {
    code = generateCode();
  }

  const session = await prisma.groupSession.create({
    data: { code, hostId: userId, members: { create: { userId, liftId } } },
  });

  res.redirect(`/group/${session.id}`);
});

// Main group workout page
router.get("/group/:sessionId", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const userId = user.userId;
  const sessionId = parseInt(req.params.sessionId);

  const session = await prisma.groupSession.findUnique({
    where: { id: sessionId },
    include: { members: { include: { lift: true }, orderBy: { joinedAt: "asc" } } },
  });

  if (!session) return res.redirect("/");

  const isMember = session.members.some((m) => m.userId === userId);

  if (!isMember) {
    if (session.status !== "ACTIVE" || !GROUP_WORKOUTS_ENABLED) {
      return res.redirect("/#tab-workouts");
    }
    const hostProfile = await prisma.userProfile.findUnique({ where: { userId: session.hostId } });
    const configs = await prisma.userLiftConfig.findMany({ where: { userId }, include: { lift: true } });
    const myLifts = configs.map((c) => ({ id: c.liftId, name: c.lift.name }));
    return res.render("group-workout", {
      user, session, isMember: false, sessionEnded: false,
      myLifts, hostName: hostProfile?.displayName ?? session.hostId,
    });
  }

  const allProfileIds = session.members.map((m) => m.userId);
  const profiles = await prisma.userProfile.findMany({ where: { userId: { in: allProfileIds } } });
  const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p]));

  const membersData = await Promise.all(
    session.members.map(async (m) => {
      const config = await getConfig(m.userId, m.liftId);
      const plan = config ? await buildPlan(config, m.lift) : null;
      const auxLifts = await prisma.auxLift.findMany({
        where: { userId: m.userId, liftId: m.liftId },
        orderBy: { displayOrder: "asc" },
      });
      return {
        userId: m.userId,
        displayName: profileMap[m.userId]?.displayName ?? m.userId,
        pictureUrl: profileMap[m.userId]?.pictureUrl ?? null,
        liftName: m.lift.name,
        status: m.status,
        plan,
        auxLifts,
      };
    })
  );

  const completedSets = await getAllCompleted(sessionId);
  const myTabIndex = Math.max(0, membersData.findIndex((m) => m.userId === userId));
  const myStatus = session.members.find((m) => m.userId === userId)?.status ?? "ACTIVE";

  res.render("group-workout", {
    user, session, isMember: true, sessionEnded: false,
    members: membersData, completedSets, myUserId: userId, myTabIndex, myStatus,
  });
});

// Join an existing session
router.post("/group/:sessionId/join", ensureAuth, async (req, res) => {
  if (!GROUP_WORKOUTS_ENABLED) return rejectMultiplayer(req, res);
  const user = req.user as any;
  const userId = user.userId;
  const sessionId = parseInt(req.params.sessionId);
  const liftId = parseInt(req.body.liftId);

  const session = await prisma.groupSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== "ACTIVE") return res.redirect("/");

  const existing = await prisma.groupSessionMember.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
  });
  if (existing) return res.redirect(`/group/${sessionId}`);

  const config = await getConfig(userId, liftId);
  if (!config) return res.redirect(`/group/${sessionId}`);

  const lift = await prisma.coreWorkout.findUnique({ where: { id: liftId } });
  if (!lift) return res.redirect("/");

  await ensureAuxLifts(userId, liftId, lift.name, config.trainingMax);
  await prisma.groupSessionMember.create({ data: { sessionId, userId, liftId } });

  res.redirect(`/group/${sessionId}`);
});

// Toggle a set completion in memory
router.post("/group/:sessionId/set-toggle", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const sessionId = parseInt(req.params.sessionId);
  const setKey = req.body.setKey as string;

  const member = await prisma.groupSessionMember.findUnique({
    where: { sessionId_userId: { sessionId, userId: user.userId } },
  });
  if (!member) return res.status(403).json({ error: "Not a member" });

  const active = await toggleSet(sessionId, user.userId, setKey);
  res.json({ active });
});

// Polling endpoint — returns current set completions and member statuses
router.get("/group/:sessionId/state", ensureAuth, async (req, res) => {
  const sessionId = parseInt(req.params.sessionId);
  const session = await prisma.groupSession.findUnique({
    where: { id: sessionId },
    include: { members: true },
  });
  if (!session) return res.status(404).json({ error: "Not found" });

  const memberStatuses: Record<string, string> = {};
  for (const m of session.members) memberStatuses[m.userId] = m.status;

  res.json({
    sessionStatus: session.status,
    memberCount: session.members.length,
    completed: await getAllCompleted(sessionId),
    memberStatuses,
  });
});

// Leave a session (active members only — completed members just navigate away)
router.post("/group/:sessionId/leave", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const userId = user.userId;
  const sessionId = parseInt(req.params.sessionId);

  const member = await prisma.groupSessionMember.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
  });

  if (member && member.status === "ACTIVE") {
    await prisma.auxLift.deleteMany({ where: { userId, liftId: member.liftId } });
    await prisma.groupSessionMember.delete({ where: { sessionId_userId: { sessionId, userId } } });

    const remaining = await prisma.groupSessionMember.findMany({ where: { sessionId } });
    if (remaining.length === 0 || remaining.every((m) => m.status === "COMPLETED")) {
      await prisma.groupSession.update({ where: { id: sessionId }, data: { status: "COMPLETED" } });
      await clearSession(sessionId);
    }
  }

  res.redirect("/#tab-workouts");
});

// Complete workout for this member
router.post("/group/:sessionId/complete", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const userId = user.userId;
  const sessionId = parseInt(req.params.sessionId);
  const amrapReps = parseInt(req.body.amrapReps as string) || 0;

  const member = await prisma.groupSessionMember.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
  });
  if (!member || member.status === "COMPLETED") return res.redirect(`/group/${sessionId}`);

  const config = await getConfig(userId, member.liftId);
  if (config) await completeWorkout(config, amrapReps);

  await prisma.auxLift.deleteMany({ where: { userId, liftId: member.liftId } });

  await prisma.groupSessionMember.update({
    where: { sessionId_userId: { sessionId, userId } },
    data: { status: "COMPLETED" },
  });

  const allMembers = await prisma.groupSessionMember.findMany({ where: { sessionId } });
  if (allMembers.every((m) => m.status === "COMPLETED")) {
    await prisma.groupSession.update({ where: { id: sessionId }, data: { status: "COMPLETED" } });
    await clearSession(sessionId);
  }

  res.redirect(`/group/${sessionId}`);
});

export default router;
