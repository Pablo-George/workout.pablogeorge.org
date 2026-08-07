import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { badRequest, forbidden, handler, intParam, notFound, sendData } from "../lib/respond.js";
import { buildPlan, completeWorkout, createConfig, getConfig } from "../services/workoutService.js";
import { ensureAuxLifts, generateUniqueCode } from "../services/groupService.js";
import { clearMember, clearSession, getAllCompleted, toggleSet } from "../services/groupState.js";
import { getFriendIds } from "../services/socialService.js";

const router = Router();

/** ACTIVE sessions containing at least one of the viewer's friends. */
router.get(
  "/rooms",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const friendIds = await getFriendIds(userId);
    if (friendIds.length === 0) return sendData(res, []);

    const sessions = await prisma.groupSession.findMany({
      where: { status: "ACTIVE", members: { some: { userId: { in: friendIds } } } },
      include: { members: { include: { lift: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (sessions.length === 0) return sendData(res, []);

    const memberIds = [...new Set(sessions.flatMap((s) => s.members.map((m) => m.userId)))];
    const profiles = await prisma.userProfile.findMany({ where: { userId: { in: memberIds } } });
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    sendData(
      res,
      sessions.map((s) => ({
        id: s.id,
        members: s.members.map((m) => ({
          userId: m.userId,
          displayName: profileMap.get(m.userId)?.displayName ?? m.userId,
          pictureUrl: profileMap.get(m.userId)?.pictureUrl ?? null,
          liftName: m.lift.name,
        })),
      })),
    );
  }),
);

/** Resolve a share code to a session id. */
router.get(
  "/by-code/:code",
  requireAuth,
  handler(async (req, res) => {
    // Codes are generated uppercase, so normalising here keeps the lookup
    // independent of database collation.
    const session = await prisma.groupSession.findUnique({
      where: { code: req.params.code.toUpperCase() },
      select: { id: true, status: true },
    });
    if (!session || session.status !== "ACTIVE") throw notFound("Session not found");
    sendData(res, { sessionId: session.id });
  }),
);

router.post(
  "/",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const liftId = Number(req.body?.liftId);
    if (!Number.isInteger(liftId)) throw badRequest("Invalid lift");

    const lift = await prisma.coreWorkout.findUnique({ where: { id: liftId } });
    if (!lift || lift.userId !== userId) throw notFound("Lift not found");

    // A solo session for this lift that is still open is resumed rather than
    // duplicated, so leaving and re-entering doesn't strand the old one.
    const existing = await prisma.groupSessionMember.findFirst({
      where: { userId, liftId, session: { status: "ACTIVE" } },
      include: { session: { include: { members: { select: { id: true } } } } },
    });
    if (existing && existing.session.members.length === 1) {
      return sendData(res, { sessionId: existing.sessionId, resumed: true });
    }

    let config = await getConfig(userId, liftId);
    if (!config) {
      const trainingMax = Number(req.body?.trainingMax);
      if (!Number.isFinite(trainingMax) || trainingMax < 45) {
        throw badRequest("Set a training max of at least 45 lbs to start");
      }
      await createConfig(userId, lift, trainingMax);
      config = await getConfig(userId, liftId);
    }
    if (!config) throw badRequest("Could not set up this lift");

    await ensureAuxLifts(userId, liftId, lift.name, config.trainingMax);

    const session = await prisma.groupSession.create({
      data: { code: await generateUniqueCode(), hostId: userId, members: { create: { userId, liftId } } },
    });

    sendData(res, { sessionId: session.id, code: session.code, resumed: false }, 201);
  }),
);

router.get(
  "/:sessionId",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const sessionId = intParam(req.params.sessionId, "sessionId");

    const session = await prisma.groupSession.findUnique({
      where: { id: sessionId },
      include: { members: { include: { lift: true }, orderBy: { joinedAt: "asc" } } },
    });
    if (!session) throw notFound("Session not found");

    const isMember = session.members.some((m) => m.userId === userId);

    if (!isMember) {
      // Non-members get only enough to render the join screen.
      const [hostProfile, myConfigs] = await Promise.all([
        prisma.userProfile.findUnique({ where: { userId: session.hostId } }),
        prisma.userLiftConfig.findMany({ where: { userId }, include: { lift: true } }),
      ]);
      return sendData(res, {
        sessionId: session.id,
        code: session.code,
        status: session.status,
        isMember: false,
        hostName: hostProfile?.displayName ?? session.hostId,
        myLifts: myConfigs.map((c) => ({ id: c.liftId, name: c.lift.name })),
      });
    }

    const memberIds = session.members.map((m) => m.userId);

    // Three queries for the whole room. The page this replaces ran getConfig
    // and an aux-lift query per member, serially, inside a Promise.all.
    const [profiles, configs, auxLifts, completedSets] = await Promise.all([
      prisma.userProfile.findMany({ where: { userId: { in: memberIds } } }),
      prisma.userLiftConfig.findMany({ where: { userId: { in: memberIds } } }),
      prisma.auxLift.findMany({
        where: { userId: { in: memberIds } },
        orderBy: { displayOrder: "asc" },
      }),
      getAllCompleted(sessionId),
    ]);

    const profileMap = new Map(profiles.map((p) => [p.userId, p]));
    const configMap = new Map(configs.map((c) => [`${c.userId}:${c.liftId}`, c]));

    const members = await Promise.all(
      session.members.map(async (m) => {
        const config = configMap.get(`${m.userId}:${m.liftId}`);
        return {
          userId: m.userId,
          displayName: profileMap.get(m.userId)?.displayName ?? m.userId,
          pictureUrl: profileMap.get(m.userId)?.pictureUrl ?? null,
          liftName: m.lift.name,
          status: m.status,
          plan: config ? await buildPlan(config, m.lift) : null,
          auxLifts: auxLifts.filter((a) => a.userId === m.userId && a.liftId === m.liftId),
          completedSets: completedSets[m.userId] ?? [],
        };
      }),
    );

    sendData(res, {
      sessionId: session.id,
      code: session.code,
      status: session.status,
      isMember: true,
      myUserId: userId,
      myStatus: session.members.find((m) => m.userId === userId)?.status ?? "ACTIVE",
      members,
    });
  }),
);

router.post(
  "/:sessionId/join",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const sessionId = intParam(req.params.sessionId, "sessionId");
    const liftId = Number(req.body?.liftId);
    if (!Number.isInteger(liftId)) throw badRequest("Invalid lift");

    const session = await prisma.groupSession.findUnique({ where: { id: sessionId } });
    if (!session) throw notFound("Session not found");
    if (session.status !== "ACTIVE") throw badRequest("This session has ended");

    const already = await prisma.groupSessionMember.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (already) return sendData(res, { sessionId, joined: false });

    const lift = await prisma.coreWorkout.findUnique({ where: { id: liftId } });
    if (!lift || lift.userId !== userId) throw notFound("Lift not found");

    const config = await getConfig(userId, liftId);
    if (!config) throw badRequest("Set a training max for this lift first");

    await ensureAuxLifts(userId, liftId, lift.name, config.trainingMax);
    await prisma.groupSessionMember.create({ data: { sessionId, userId, liftId } });

    sendData(res, { sessionId, joined: true }, 201);
  }),
);

router.post(
  "/:sessionId/set-toggle",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const sessionId = intParam(req.params.sessionId, "sessionId");
    const setKey = String(req.body?.setKey ?? "").trim();
    if (!setKey) throw badRequest("setKey is required");

    const member = await prisma.groupSessionMember.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!member) throw forbidden("Not a member of this session");

    sendData(res, { setKey, active: await toggleSet(sessionId, userId, setKey) });
  }),
);

router.post(
  "/:sessionId/leave",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const sessionId = intParam(req.params.sessionId, "sessionId");

    const member = await prisma.groupSessionMember.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    // Completed members simply navigate away; only active ones "leave".
    if (!member || member.status !== "ACTIVE") return sendData(res, { left: false });

    await prisma.auxLift.deleteMany({ where: { userId, liftId: member.liftId } });
    await prisma.groupSessionMember.delete({ where: { sessionId_userId: { sessionId, userId } } });
    await clearMember(sessionId, userId);

    const remaining = await prisma.groupSessionMember.findMany({ where: { sessionId } });
    if (remaining.length === 0 || remaining.every((m) => m.status === "COMPLETED")) {
      await prisma.groupSession.update({ where: { id: sessionId }, data: { status: "COMPLETED" } });
      await clearSession(sessionId);
    }

    sendData(res, { left: true });
  }),
);

router.post(
  "/:sessionId/complete",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const sessionId = intParam(req.params.sessionId, "sessionId");
    const amrapReps = Number(req.body?.amrapReps);
    if (!Number.isInteger(amrapReps) || amrapReps < 0 || amrapReps > 99) {
      throw badRequest("AMRAP reps must be between 0 and 99");
    }

    const member = await prisma.groupSessionMember.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!member) throw forbidden("Not a member of this session");
    if (member.status === "COMPLETED") throw badRequest("Already completed");

    const config = await getConfig(userId, member.liftId);
    if (config) await completeWorkout(config, amrapReps);

    await prisma.auxLift.deleteMany({ where: { userId, liftId: member.liftId } });
    await prisma.groupSessionMember.update({
      where: { sessionId_userId: { sessionId, userId } },
      data: { status: "COMPLETED" },
    });

    const all = await prisma.groupSessionMember.findMany({ where: { sessionId } });
    const sessionComplete = all.every((m) => m.status === "COMPLETED");
    if (sessionComplete) {
      await prisma.groupSession.update({ where: { id: sessionId }, data: { status: "COMPLETED" } });
      await clearSession(sessionId);
    }

    sendData(res, { completed: true, sessionComplete });
  }),
);

export default router;
