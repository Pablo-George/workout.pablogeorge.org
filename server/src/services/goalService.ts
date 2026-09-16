import { prisma } from "../app.js";
import { serverToday } from "../lib/dates.js";

// ── Calorie burn estimation ─────────────────────────────────────────────
// No wearable data yet (Apple Fitness/HealthKit integration is planned —
// real duration and heart rate will replace these assumptions once it
// lands), so burn is estimated from standard MET values, the user's logged
// bodyweight, and an assumed duration per logged unit of work.
// kcal/min = MET * 3.5 * weightKg / 200 (standard MET formula).

const KG_PER_LB = 0.453592;
const DEFAULT_BODYWEIGHT_LBS = 170;

const MAIN_LIFT_MET = 5.0; // free-weight training, moderate-vigorous effort
const MAIN_LIFT_MINUTES = 12; // one lift's 5-set 5/3/1 session
const AUX_LIFT_MET = 4.0; // lighter accessory work
const AUX_LIFT_MINUTES = 5;
const CALISTHENICS_MET = 8.0; // vigorous bodyweight circuit effort
const CALISTHENICS_SECONDS_PER_REP = 3;

function metCaloriesPerMinute(met: number, weightLbs: number): number {
  const weightKg = weightLbs * KG_PER_LB;
  return (met * 3.5 * weightKg) / 200;
}

function estimateMainLiftCalories(weightLbs: number): number {
  return metCaloriesPerMinute(MAIN_LIFT_MET, weightLbs) * MAIN_LIFT_MINUTES;
}

function estimateAuxLiftCalories(weightLbs: number): number {
  return metCaloriesPerMinute(AUX_LIFT_MET, weightLbs) * AUX_LIFT_MINUTES;
}

function estimateCalisthenicsCalories(reps: number, weightLbs: number): number {
  const minutes = (reps * CALISTHENICS_SECONDS_PER_REP) / 60;
  return metCaloriesPerMinute(CALISTHENICS_MET, weightLbs) * minutes;
}

// ── Date helpers (self-contained: these strings are always UTC "YYYY-MM-DD",
// matching how completedOn/loggedOn are stored elsewhere in the app) ───────

function parseISO(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseISO(toISO).getTime() - parseISO(fromISO).getTime()) / 86_400_000);
}

function* dateRange(fromISO: string, toISO: string): Generator<string> {
  let d = fromISO;
  while (d <= toISO) {
    yield d;
    d = addDays(d, 1);
  }
}

/** Forward-fills bodyweight across a date range from sparse weigh-ins, so a
 *  historical burn estimate uses the weight the user actually had around
 *  that date rather than today's. Falls back to the earliest known weight
 *  for dates before the first log, or a generic default if none exist. */
function buildWeightLookup(history: { loggedOn: string; weightLbs: number }[]) {
  const sorted = [...history].sort((a, b) => a.loggedOn.localeCompare(b.loggedOn));
  return (date: string): number => {
    let result = sorted.length > 0 ? sorted[0].weightLbs : DEFAULT_BODYWEIGHT_LBS;
    for (const entry of sorted) {
      if (entry.loggedOn > date) break;
      result = entry.weightLbs;
    }
    return result;
  };
}

/** Estimated calories burned per day (UTC "YYYY-MM-DD" keys) over an
 *  inclusive date range, summed across main lifts, accessory lifts, and
 *  calisthenics. */
export async function getCaloriesBurnedByDay(
  userId: string,
  fromISO: string,
  toISO: string
): Promise<Record<string, number>> {
  const [weightHistory, mainLogs, auxLogs, calLogs] = await Promise.all([
    prisma.bodyWeightLog.findMany({ where: { userId }, orderBy: { loggedOn: "asc" } }),
    prisma.workoutLog.findMany({ where: { userId, completedOn: { gte: fromISO, lte: toISO } } }),
    prisma.auxLiftLog.findMany({ where: { userId, completedOn: { gte: fromISO, lte: toISO } } }),
    prisma.calisthenicsLog.findMany({ where: { userId, completedOn: { gte: fromISO, lte: toISO } } }),
  ]);

  const weightAt = buildWeightLookup(weightHistory);
  const byDay: Record<string, number> = {};
  for (const d of dateRange(fromISO, toISO)) byDay[d] = 0;

  for (const log of mainLogs) {
    byDay[log.completedOn] = (byDay[log.completedOn] ?? 0) + estimateMainLiftCalories(weightAt(log.completedOn));
  }
  for (const log of auxLogs) {
    byDay[log.completedOn] = (byDay[log.completedOn] ?? 0) + estimateAuxLiftCalories(weightAt(log.completedOn));
  }
  for (const log of calLogs) {
    byDay[log.completedOn] =
      (byDay[log.completedOn] ?? 0) + estimateCalisthenicsCalories(log.reps, weightAt(log.completedOn));
  }

  return byDay;
}

// ── Weight goal + projection ────────────────────────────────────────────

const TRAILING_WINDOW_DAYS = 14; // calorie-balance cross-check window
const TREND_WINDOW_DAYS = 90; // weigh-in regression window
const LBS_PER_CALORIE = 1 / 3500;
const DAYS_PER_MONTH = 30.44;

// Auto-calculated daily calorie target: a bodyweight-based proxy for BMR +
// non-exercise activity (deliberately excludes logged workouts, since actual
// estimated exercise burn — averaged over the trailing window, so rest days
// don't zero it out — is added on top instead of guessing an activity
// multiplier), then a standard deficit/surplus toward the goal direction.
const MAINTENANCE_KCAL_PER_LB = 12;
const LOSS_DEFICIT_KCAL = 500; // ~1 lb/week
const GAIN_SURPLUS_KCAL = 300; // ~0.6 lb/week, conservative to limit fat gain
const MIN_DAILY_CALORIES = 1200; // safety floor
const MAINTENANCE_BAND_LBS = 1; // within this much of goal, target maintenance

function linearRegressionSlope(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 2) return null;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Months until `current` reaches `goal` at a steady `lbsPerDay` rate. Null
 *  when already there isn't meaningful (returns 0), the rate is ~flat, or
 *  the trend is heading the wrong way. */
function monthsToGoal(current: number, goal: number, lbsPerDay: number): number | null {
  const diff = goal - current;
  if (Math.abs(diff) < 0.15) return 0;
  if (Math.abs(lbsPerDay) < 0.001) return null;
  if (Math.sign(diff) !== Math.sign(lbsPerDay)) return null;
  return diff / lbsPerDay / DAYS_PER_MONTH;
}

export interface GoalSummary {
  goalWeightLbs: number | null;
  /** Auto-calculated from current weight, goal direction, and recent logged
   *  activity — not user-entered. Null until a goal weight and a current
   *  weigh-in both exist. */
  dailyCalorieGoal: number | null;
  currentWeight: number | null;
  currentWeightDate: string | null;
  todayCaloriesBurned: number;
  /** Average (calories eaten − estimated burned) per day over the trailing
   *  window; null when there's no calorie data at all yet. */
  avgNetCaloriesPerDay: number | null;
  trend: { lbsPerWeek: number } | null;
  /** Projection from actual weigh-in history — the primary, most reliable estimate. */
  weighInsProjectionMonths: number | null;
  /** Cross-check projection from logged calorie balance (eaten vs. estimated burned). */
  calorieProjectionMonths: number | null;
  /** True when there isn't enough weigh-in history yet for a trend line. */
  insufficientWeightData: boolean;
}

export async function buildGoalSummary(userId: string): Promise<GoalSummary> {
  const today = serverToday();
  const trendStart = addDays(today, -TREND_WINDOW_DAYS);
  const windowStart = addDays(today, -(TRAILING_WINDOW_DAYS - 1));

  const [profile, latestWeight, trendHistory, eatenEntries, burnedByDay] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.bodyWeightLog.findFirst({ where: { userId }, orderBy: { loggedOn: "desc" } }),
    prisma.bodyWeightLog.findMany({ where: { userId, loggedOn: { gte: trendStart } }, orderBy: { loggedOn: "asc" } }),
    prisma.calorieEntry.findMany({ where: { userId, loggedOn: { gte: windowStart } } }),
    getCaloriesBurnedByDay(userId, windowStart, today),
  ]);

  const goalWeightLbs = profile?.goalWeightLbs ?? null;
  const currentWeight = latestWeight?.weightLbs ?? null;

  const distinctDays = new Set(trendHistory.map((w) => w.loggedOn)).size;
  const spanDays =
    trendHistory.length >= 2 ? daysBetween(trendHistory[0].loggedOn, trendHistory[trendHistory.length - 1].loggedOn) : 0;
  const insufficientWeightData = distinctDays < 3 || spanDays < 6;

  let trend: { lbsPerWeek: number } | null = null;
  let weighInsProjectionMonths: number | null = null;
  if (!insufficientWeightData) {
    const base = parseISO(trendHistory[0].loggedOn).getTime();
    const points = trendHistory.map((w) => ({
      x: (parseISO(w.loggedOn).getTime() - base) / 86_400_000,
      y: w.weightLbs,
    }));
    const slope = linearRegressionSlope(points); // lbs/day
    if (slope != null) {
      trend = { lbsPerWeek: slope * 7 };
      if (goalWeightLbs != null && currentWeight != null) {
        weighInsProjectionMonths = monthsToGoal(currentWeight, goalWeightLbs, slope);
      }
    }
  }

  const eatenByDay: Record<string, number> = {};
  for (const e of eatenEntries) eatenByDay[e.loggedOn] = (eatenByDay[e.loggedOn] ?? 0) + e.calories;
  const dayKeys = Object.keys(burnedByDay);
  const netTotals = dayKeys.map((d) => (eatenByDay[d] ?? 0) - burnedByDay[d]);
  const avgNetCaloriesPerDay =
    dayKeys.length > 0 ? netTotals.reduce((s, v) => s + v, 0) / dayKeys.length : null;

  let calorieProjectionMonths: number | null = null;
  if (avgNetCaloriesPerDay != null && goalWeightLbs != null && currentWeight != null) {
    const lbsPerDay = avgNetCaloriesPerDay * LBS_PER_CALORIE;
    calorieProjectionMonths = monthsToGoal(currentWeight, goalWeightLbs, lbsPerDay);
  }

  let dailyCalorieGoal: number | null = null;
  if (goalWeightLbs != null && currentWeight != null) {
    const avgBurnedPerDay = dayKeys.length > 0 ? dayKeys.reduce((s, d) => s + burnedByDay[d], 0) / dayKeys.length : 0;
    const maintenance = currentWeight * MAINTENANCE_KCAL_PER_LB + avgBurnedPerDay;
    const diff = goalWeightLbs - currentWeight;
    const target =
      Math.abs(diff) < MAINTENANCE_BAND_LBS
        ? maintenance
        : diff < 0
        ? maintenance - LOSS_DEFICIT_KCAL
        : maintenance + GAIN_SURPLUS_KCAL;
    dailyCalorieGoal = Math.round(Math.max(MIN_DAILY_CALORIES, target));
  }

  return {
    goalWeightLbs,
    dailyCalorieGoal,
    currentWeight,
    currentWeightDate: latestWeight?.loggedOn ?? null,
    todayCaloriesBurned: Math.round(burnedByDay[today] ?? 0),
    avgNetCaloriesPerDay: avgNetCaloriesPerDay != null ? Math.round(avgNetCaloriesPerDay) : null,
    trend,
    weighInsProjectionMonths,
    calorieProjectionMonths,
    insufficientWeightData,
  };
}
