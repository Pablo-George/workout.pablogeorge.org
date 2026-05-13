import { Router } from "express";
import { ensureAuth } from "../middleware/auth.js";
import { prisma } from "../app.js";
import { buildChartDatasets, getWeekLabels, countLogs } from "../services/workoutService.js";
import crypto from "node:crypto";

const router = Router();

router.get("/", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const userId = user.userId;

  const coreWorkouts = await prisma.coreWorkout.findMany({ where: { userId } });

  if (coreWorkouts.length === 0) {
    const defaults = ["Bench Press", "Squat", "Deadlift", "Overhead Press"];
    for (const name of defaults) {
      await prisma.coreWorkout.create({ data: { name, userId } });
    }
  }

  const lifts = await prisma.coreWorkout.findMany({ where: { userId } });
  const configs = await prisma.userLiftConfig.findMany({ where: { userId } });
  const configByLiftId = Object.fromEntries(configs.map((c) => [c.liftId, c]));
  const liftsWithConfig = lifts.map((l) => {
    const config = configByLiftId[l.id] ?? null;
    return {
      ...l,
      trainingMax: config?.trainingMax ?? null,
      currentWeek: config?.currentWeek ?? null,
    };
  });

  const weekLabels = await getWeekLabels(userId);
  const chartDatasets = await buildChartDatasets(userId);
  const totalSessions = await countLogs(userId);

  const latestWeight = await prisma.bodyWeightLog.findFirst({
    where: { userId },
    orderBy: { loggedOn: "desc" },
  });

  const feedPosts = await getFeed(userId);
  const pendingRequests = await getPendingRequests(userId);
  const friends = await getFriends(userId);
  const inviteToken = await getOrCreateInviteToken(userId);
  const inviteLink = `${req.protocol}://${req.get("host")}/invite/${inviteToken}`;
  const myProfile = await prisma.userProfile.findUnique({ where: { userId } });
  const hideWeight = myProfile?.hideWeight ?? false;

  const today = new Date().toISOString().split("T")[0];
  const calEntries = await prisma.calorieEntry.findMany({
    where: { userId, loggedOn: today },
    orderBy: { createdAt: "desc" },
  });
  const calTotal = calEntries.reduce((sum, e) => sum + e.calories, 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const calHistory = await prisma.calorieEntry.findMany({
    where: { userId, loggedOn: { gte: thirtyDaysAgo.toISOString().split("T")[0] } },
    orderBy: { loggedOn: "asc" },
  });
  const calByDay: Record<string, number> = {};
  for (const entry of calHistory) {
    calByDay[entry.loggedOn] = (calByDay[entry.loggedOn] ?? 0) + entry.calories;
  }
  const calChartData = Object.entries(calByDay).map(([date, total]) => ({ date, total }));

  res.render("home", {
    user,
    coreWorkouts: liftsWithConfig,
    weekLabels,
    chartDatasets,
    totalSessions,
    currentWeight: latestWeight?.weightLbs ?? null,
    hideWeight,
    feedPosts,
    pendingRequests,
    friends,
    inviteLink,
    calEntries,
    calTotal,
    calChartData,
  });
});

router.post("/profile/lifts", ensureAuth, async (req, res) => {
  const user = req.user as any;
  await prisma.coreWorkout.create({
    data: { name: (req.body.name as string).trim(), userId: user.userId },
  });
  res.redirect("/#tab-profile");
});

router.post("/profile/lifts/delete", ensureAuth, async (req, res) => {
  const id = parseInt(req.body.id as string);
  await prisma.coreWorkout.delete({ where: { id } });
  res.redirect("/#tab-profile");
});

router.post("/profile/weight", ensureAuth, async (req, res) => {
  const user = req.user as any;
  await prisma.bodyWeightLog.create({
    data: {
      userId: user.userId,
      weightLbs: parseFloat(req.body.weightLbs as string),
      loggedOn: new Date().toISOString().split("T")[0],
    },
  });
  res.redirect("/#tab-profile");
});

router.post("/profile/privacy", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const current = await prisma.userProfile.findUnique({ where: { userId: user.userId } });
  await prisma.userProfile.update({
    where: { userId: user.userId },
    data: { hideWeight: !current?.hideWeight },
  });
  res.redirect("/#tab-profile");
});

router.get("/user/:userId", ensureAuth, async (req, res) => {
  const viewer = req.user as any;
  const targetId = req.params.userId;

  const friendIds = await getFriendIds(viewer.userId);
  if (!friendIds.includes(targetId)) return res.redirect("/");

  const profile = await prisma.userProfile.findUnique({ where: { userId: targetId } });
  const lifts = await prisma.coreWorkout.findMany({ where: { userId: targetId } });
  const configs = await prisma.userLiftConfig.findMany({ where: { userId: targetId } });
  const configByLiftId = Object.fromEntries(configs.map((c) => [c.liftId, c]));
  const liftsWithConfig = lifts.map((l) => ({
    ...l,
    trainingMax: configByLiftId[l.id]?.trainingMax ?? null,
    currentWeek: configByLiftId[l.id]?.currentWeek ?? null,
  }));

  let currentWeight: number | null = null;
  if (!profile?.hideWeight) {
    const latest = await prisma.bodyWeightLog.findFirst({
      where: { userId: targetId },
      orderBy: { loggedOn: "desc" },
    });
    currentWeight = latest?.weightLbs ?? null;
  }

  res.render("friend-profile", {
    profile: { displayName: profile?.displayName ?? targetId, pictureUrl: profile?.pictureUrl ?? null },
    liftsWithConfig,
    currentWeight,
    hideWeight: profile?.hideWeight ?? false,
  });
});

async function getFeed(userId: string) {
  const friendIds = await getFriendIds(userId);
  const visibleIds = [...friendIds, userId];

  const posts = await prisma.post.findMany({
    where: { authorId: { in: visibleIds } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return Promise.all(
    posts.map(async (post) => {
      const profile = await prisma.userProfile.findUnique({
        where: { userId: post.authorId },
      });
      return {
        authorName: profile?.displayName ?? post.authorId,
        authorPicture: profile?.pictureUrl ?? null,
        content: post.content,
        imageUrl: post.imageUrl,
        timeAgo: timeAgo(post.createdAt),
      };
    })
  );
}

async function getPendingRequests(userId: string) {
  const requests = await prisma.friendship.findMany({
    where: { addresseeId: userId, status: "PENDING" },
  });

  return Promise.all(
    requests.map(async (f) => {
      const profile = await prisma.userProfile.findUnique({
        where: { userId: f.requesterId },
      });
      return {
        friendshipId: f.id,
        requesterEmail: f.requesterId,
        requesterName: profile?.displayName ?? f.requesterId,
        requesterPicture: profile?.pictureUrl ?? null,
      };
    })
  );
}

async function getFriendIds(userId: string) {
  const sent = await prisma.friendship.findMany({
    where: { requesterId: userId, status: "ACCEPTED" },
  });
  const received = await prisma.friendship.findMany({
    where: { addresseeId: userId, status: "ACCEPTED" },
  });
  return [
    ...sent.map((f) => f.addresseeId),
    ...received.map((f) => f.requesterId),
  ];
}

async function getFriends(userId: string) {
  const sent = await prisma.friendship.findMany({
    where: { requesterId: userId, status: "ACCEPTED" },
  });
  const received = await prisma.friendship.findMany({
    where: { addresseeId: userId, status: "ACCEPTED" },
  });

  const all = [
    ...sent.map((f) => ({ friendshipId: f.id, friendId: f.addresseeId })),
    ...received.map((f) => ({ friendshipId: f.id, friendId: f.requesterId })),
  ];

  return Promise.all(
    all.map(async ({ friendshipId, friendId }) => {
      const profile = await prisma.userProfile.findUnique({ where: { userId: friendId } });
      return {
        friendshipId,
        userId: friendId,
        name: profile?.displayName ?? friendId,
        pictureUrl: profile?.pictureUrl ?? null,
      };
    })
  );
}

async function getOrCreateInviteToken(userId: string) {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (profile?.inviteToken) return profile.inviteToken;

  const token = crypto.randomBytes(16).toString("hex");
  await prisma.userProfile.update({ where: { userId }, data: { inviteToken: token } });
  return token;
}

function timeAgo(dt: Date) {
  const seconds = Math.floor(
    (Date.now() - dt.getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default router;
