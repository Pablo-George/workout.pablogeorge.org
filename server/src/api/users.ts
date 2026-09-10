import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { handler, notFound, sendData } from "../lib/respond.js";
import { getFriendIds } from "../services/socialService.js";

const router = Router();

/**
 * A friend's read-only profile. Visible only to accepted friends, and the body
 * weight is withheld entirely when they've turned the privacy toggle on —
 * omitted rather than nulled so it never reaches the client.
 */
router.get(
  "/:userId",
  requireAuth,
  handler(async (req, res) => {
    const viewer = currentUser(req);
    const targetId = req.params.userId;

    const friendIds = await getFriendIds(viewer.userId);
    if (targetId !== viewer.userId && !friendIds.includes(targetId)) {
      throw notFound("Profile not found");
    }

    const profile = await prisma.userProfile.findUnique({ where: { userId: targetId } });
    if (!profile) throw notFound("Profile not found");

    const [lifts, configs, publishedPlaylists, activeMembership, listening] = await Promise.all([
      prisma.coreWorkout.findMany({ where: { userId: targetId }, orderBy: { id: "asc" } }),
      prisma.userLiftConfig.findMany({ where: { userId: targetId } }),
      prisma.musicPlaylist.findMany({ where: { userId: targetId, isPublished: true }, orderBy: { updatedAt: "desc" } }),
      prisma.groupSessionMember.findFirst({
        where: { userId: targetId, status: "ACTIVE", session: { status: "ACTIVE" } },
        include: { lift: true }, orderBy: { joinedAt: "desc" },
      }),
      prisma.currentListening.findUnique({ where: { userId: targetId } }),
    ]);
    const configByLiftId = new Map(configs.map((c) => [c.liftId, c]));

    let currentWeight: number | null = null;
    if (!profile.hideWeight) {
      const latest = await prisma.bodyWeightLog.findFirst({
        where: { userId: targetId },
        orderBy: { loggedOn: "desc" },
      });
      currentWeight = latest?.weightLbs ?? null;
    }

    sendData(res, {
      // Deliberately narrow: never expose inviteToken.
      userId: profile.userId,
      displayName: profile.displayName ?? profile.userId,
      pictureUrl: profile.pictureUrl,
      hideWeight: profile.hideWeight,
      currentWeight,
      lifts: lifts.map((lift) => ({
        id: lift.id,
        name: lift.name,
        trainingMax: configByLiftId.get(lift.id)?.trainingMax ?? null,
        currentWeek: configByLiftId.get(lift.id)?.currentWeek ?? null,
      })),
      publishedPlaylists,
      nowPlaying: activeMembership && listening && listening.isPlaying && Date.now() - listening.updatedAt.getTime() < 90_000
        ? { title: listening.title, artist: listening.artist, album: listening.album,
            artworkUrl: listening.artworkUrl, externalUrl: listening.externalUrl,
            provider: listening.provider, liftName: activeMembership.lift.name }
        : null,
    });
  }),
);

export default router;
