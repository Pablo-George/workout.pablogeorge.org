import { Router, type Request } from "express";
import { ensureAuth } from "../middleware/auth.js";
import { prisma } from "../app.js";
import { buildChartDatasets, getWeekLabels, countLogs } from "../services/workoutService.js";
import crypto from "node:crypto";

const isHTMX = (req: Request) => req.headers["hx-request"] === "true";

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

  const activeMembership = await prisma.groupSessionMember.findFirst({
    where: { userId, status: "ACTIVE", session: { status: "ACTIVE" } },
    orderBy: { joinedAt: "desc" },
  });
  const activeSessionId = activeMembership?.sessionId ?? null;

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
    orderBy: { createdAt: "asc" },
  });
  const calTotal = calEntries.reduce((sum, e) => sum + e.calories, 0);
  const proteinTotal = calEntries.reduce((sum, e) => sum + (e.proteinG ?? 0), 0);
  const carbsTotal = calEntries.reduce((sum, e) => sum + (e.carbsG ?? 0), 0);

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

  const histGroups: Record<string, typeof calHistory> = {};
  for (const entry of calHistory) {
    if (entry.loggedOn === today) continue;
    if (!histGroups[entry.loggedOn]) histGroups[entry.loggedOn] = [];
    histGroups[entry.loggedOn].push(entry);
  }
  const calHistoryDays = Object.entries(histGroups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => ({
      date,
      displayDate: formatCalDate(date, today),
      total: entries.reduce((sum, e) => sum + e.calories, 0),
      proteinTotal: entries.reduce((sum, e) => sum + (e.proteinG ?? 0), 0),
      carbsTotal: entries.reduce((sum, e) => sum + (e.carbsG ?? 0), 0),
      entries,
    }));

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 89);
  const weightHistory = await prisma.bodyWeightLog.findMany({
    where: { userId, loggedOn: { gte: ninetyDaysAgo.toISOString().split("T")[0] } },
    orderBy: { loggedOn: "asc" },
  });
  const weightChartData = weightHistory.map((w) => ({ date: w.loggedOn, weight: w.weightLbs }));

  const calendar = await buildMonthCalendar(userId, req.query.mo);

  res.render("home", {
    user,
    coreWorkouts: liftsWithConfig,
    weekLabels,
    chartDatasets,
    totalSessions,
    activeSessionId,
    currentWeight: latestWeight?.weightLbs ?? null,
    hideWeight,
    feedPosts,
    pendingRequests,
    friends,
    inviteLink,
    calEntries,
    calTotal,
    proteinTotal,
    carbsTotal,
    calChartData,
    calHistoryDays,
    weightChartData,
    calendar,
    calsError: req.query.cals_error === "1",
    isAdmin: process.env.ADMIN_EMAIL && user.userId === process.env.ADMIN_EMAIL,
  });
});

router.post("/profile/lifts", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const name = (req.body.name as string).trim();
  const lift = await prisma.coreWorkout.create({ data: { name, userId: user.userId } });
  if (isHTMX(req)) return res.render("partials/lift-card", { w: { id: lift.id, name: lift.name, trainingMax: null, currentWeek: null } });
  res.redirect("/#tab-profile");
});

router.post("/profile/lifts/delete", ensureAuth, async (req, res) => {
  const id = parseInt(req.body.id as string);
  const auxLifts = await prisma.auxLift.findMany({ where: { liftId: id }, select: { id: true } });
  const auxIds = auxLifts.map((a) => a.id);
  if (auxIds.length) await prisma.auxLiftLog.deleteMany({ where: { auxLiftId: { in: auxIds } } });
  await prisma.auxLift.deleteMany({ where: { liftId: id } });
  await prisma.userLiftConfig.deleteMany({ where: { liftId: id } });
  await prisma.workoutLog.deleteMany({ where: { liftId: id } });
  await prisma.trainingMaxLog.deleteMany({ where: { liftId: id } });
  await prisma.coreWorkout.delete({ where: { id } });
  if (isHTMX(req)) return res.send("");
  res.redirect("/#tab-profile");
});

router.post("/profile/weight", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const weightLbs = parseFloat(req.body.weightLbs as string);
  const today = new Date().toISOString().split("T")[0];
  await prisma.bodyWeightLog.upsert({
    where: { userId_loggedOn: { userId: user.userId, loggedOn: today } },
    update: { weightLbs },
    create: { userId: user.userId, weightLbs, loggedOn: today },
  });
  if (isHTMX(req)) return res.send(`
    <div class="card" style="display:flex;align-items:baseline;gap:0.4rem;">
      <span style="font-size:1.75rem;font-weight:800;letter-spacing:-1px;">${weightLbs}</span>
      <span style="font-size:0.85rem;color:#555;">lbs &nbsp;·&nbsp; last logged</span>
    </div>`);
  res.redirect("/#tab-profile");
});

router.post("/profile/privacy", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const current = await prisma.userProfile.findUnique({ where: { userId: user.userId } });
  const hideWeight = !current?.hideWeight;
  await prisma.userProfile.update({ where: { userId: user.userId }, data: { hideWeight } });
  if (isHTMX(req)) return res.send(`<span id="privacy-status" style="font-size:0.75rem;font-weight:700;color:${hideWeight ? "#555" : "#4f9eff"};">${hideWeight ? "OFF" : "ON"}</span>`);
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
    where: { authorId: { in: visibleIds }, parentId: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });

  const allAuthorIds = new Set<string>();
  for (const post of posts) {
    allAuthorIds.add(post.authorId);
    for (const reply of post.replies) allAuthorIds.add(reply.authorId);
  }
  const profiles = await prisma.userProfile.findMany({
    where: { userId: { in: [...allAuthorIds] } },
  });
  const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p]));

  return posts.map((post) => ({
    id: post.id,
    authorId: post.authorId,
    authorName: profileMap[post.authorId]?.displayName ?? post.authorId,
    authorPicture: profileMap[post.authorId]?.pictureUrl ?? null,
    content: post.content,
    imageUrl: post.imageUrl,
    timeAgo: timeAgo(post.createdAt),
    replies: post.replies.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      authorName: profileMap[r.authorId]?.displayName ?? r.authorId,
      authorPicture: profileMap[r.authorId]?.pictureUrl ?? null,
      content: r.content,
      timeAgo: timeAgo(r.createdAt),
    })),
  }));
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

function formatCalDate(dateStr: string, today: string): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().split("T")[0]) return "Yesterday";
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ── Month activity calendar ───────────────────────────────────────────────
// All workout/calorie dates in the app are stored as UTC "YYYY-MM-DD"
// strings (see completeWorkout / cal routes), so the calendar math here
// stays in UTC too rather than mixing local-timezone days into the grid.

type CalItemKind = "main" | "aux" | "cals" | "weight";

interface CalDayItem {
  kind: CalItemKind;
  title: string;
  detail: string;
}

interface CalDay {
  iso: string;
  dayNum: number;
  detailDate: string;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  items: CalDayItem[];
}

function isoUTC(d: Date): string {
  return d.toISOString().split("T")[0];
}

function parseISO(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

function addDaysISO(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoUTC(d);
}

/** Sunday-start week containing `iso`. */
function startOfWeek(iso: string): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return isoUTC(d);
}

/** First day of the month containing `iso`, shifted by `n` months. */
function monthStartOffset(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return isoUTC(d);
}

/** Number of days in the UTC month containing `iso`. */
function daysInMonth(iso: string): number {
  const d = parseISO(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

async function buildMonthCalendar(userId: string, moParam: unknown) {
  const today = new Date().toISOString().split("T")[0];
  // Any date inside the target month; falls back to the current month.
  const anchor =
    typeof moParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(moParam) ? moParam : today;
  const monthStart = anchor.slice(0, 8) + "01";
  // Grid spans whole Sunday-start weeks covering the month (5–6 rows),
  // so activity on leading/trailing edge days still shows up.
  const gridStart = startOfWeek(monthStart);
  const rows = Math.ceil((parseISO(monthStart).getUTCDay() + daysInMonth(monthStart)) / 7);
  const gridEnd = addDaysISO(gridStart, rows * 7 - 1);

  const [mainLogs, auxLogs, weights, cals] = await Promise.all([
    prisma.workoutLog.findMany({
      where: { userId, completedOn: { gte: gridStart, lte: gridEnd } },
      include: { lift: true },
      orderBy: { id: "asc" },
    }),
    prisma.auxLiftLog.findMany({
      where: { userId, completedOn: { gte: gridStart, lte: gridEnd } },
      include: { auxLift: true },
      orderBy: { id: "asc" },
    }),
    prisma.bodyWeightLog.findMany({
      where: { userId, loggedOn: { gte: gridStart, lte: gridEnd } },
    }),
    prisma.calorieEntry.findMany({
      where: { userId, loggedOn: { gte: gridStart, lte: gridEnd } },
      select: { loggedOn: true, calories: true, proteinG: true },
    }),
  ]);

  const byDay = new Map<string, CalDayItem[]>();
  const push = (iso: string, item: CalDayItem) => {
    const list = byDay.get(iso) ?? [];
    list.push(item);
    byDay.set(iso, list);
  };

  for (const log of mainLogs) {
    push(log.completedOn, {
      kind: "main",
      title: log.lift.name,
      detail: log.amrapReps != null ? `Week ${log.week} · AMRAP ${log.amrapReps} reps` : `Week ${log.week}`,
    });
  }
  for (const log of auxLogs) {
    push(log.completedOn, {
      kind: "aux",
      title: log.auxLift.name,
      detail: log.weightLbs != null ? `${log.weightLbs} lbs` : "",
    });
  }
  for (const w of weights) {
    push(w.loggedOn, { kind: "weight", title: "Body weight", detail: `${w.weightLbs} lbs` });
  }
  const calsByDay = new Map<string, { total: number; protein: number }>();
  for (const e of cals) {
    const cur = calsByDay.get(e.loggedOn) ?? { total: 0, protein: 0 };
    cur.total += e.calories;
    cur.protein += e.proteinG ?? 0;
    calsByDay.set(e.loggedOn, cur);
  }
  for (const [iso, { total, protein }] of calsByDay) {
    push(iso, {
      kind: "cals",
      title: "Calories",
      detail: protein > 0 ? `${total.toLocaleString("en-US")} kcal · ${protein}g protein` : `${total.toLocaleString("en-US")} kcal`,
    });
  }

  const days: CalDay[] = Array.from({ length: rows * 7 }, (_, i) => {
    const iso = addDaysISO(gridStart, i);
    return {
      iso,
      dayNum: parseInt(iso.slice(8, 10), 10),
      detailDate: parseISO(iso).toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      inMonth: iso.slice(0, 7) === monthStart.slice(0, 7),
      isToday: iso === today,
      isFuture: iso > today,
      items: byDay.get(iso) ?? [],
    };
  });

  // Open today's panel when browsing the current month; otherwise open the
  // most recent in-month day that actually has something logged.
  let selectedIso: string | null = days.some((d) => d.isToday) ? today : null;
  if (!selectedIso) {
    for (let i = days.length - 1; i >= 0; i--) {
      if (!days[i].inMonth) continue;
      if ((byDay.get(days[i].iso) ?? []).length > 0) {
        selectedIso = days[i].iso;
        break;
      }
    }
  }

  const label = parseISO(monthStart).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    days,
    weekdays: ["S", "M", "T", "W", "T", "F", "S"],
    selectedIso,
    label,
    prevMo: monthStartOffset(monthStart, -1),
    nextMo: monthStartOffset(monthStart, 1),
    isCurrentMonth: monthStart === today.slice(0, 8) + "01",
  };
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
