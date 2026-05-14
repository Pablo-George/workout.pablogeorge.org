import { prisma } from "../app.js";

interface SetDef {
  pct: number;
  reps: number;
  amrap: boolean;
  warmup: boolean;
}

const PROGRAM: SetDef[][] = [
  [
    { pct: 0.50, reps: 5, amrap: false, warmup: true },
    { pct: 0.50, reps: 5, amrap: false, warmup: true },
    { pct: 0.65, reps: 5, amrap: false, warmup: false },
    { pct: 0.75, reps: 5, amrap: false, warmup: false },
    { pct: 0.85, reps: 0, amrap: true, warmup: false },
  ],
  [
    { pct: 0.50, reps: 5, amrap: false, warmup: true },
    { pct: 0.50, reps: 5, amrap: false, warmup: true },
    { pct: 0.70, reps: 5, amrap: false, warmup: false },
    { pct: 0.80, reps: 3, amrap: false, warmup: false },
    { pct: 0.90, reps: 0, amrap: true, warmup: false },
  ],
  [
    { pct: 0.50, reps: 5, amrap: false, warmup: true },
    { pct: 0.50, reps: 5, amrap: false, warmup: true },
    { pct: 0.75, reps: 3, amrap: false, warmup: false },
    { pct: 0.85, reps: 3, amrap: false, warmup: false },
    { pct: 0.95, reps: 0, amrap: true, warmup: false },
  ],
  [
    { pct: 0.40, reps: 5, amrap: false, warmup: true },
    { pct: 0.40, reps: 5, amrap: false, warmup: true },
    { pct: 0.50, reps: 5, amrap: false, warmup: false },
    { pct: 0.60, reps: 5, amrap: false, warmup: false },
    { pct: 0.70, reps: 0, amrap: true, warmup: false },
  ],
];

export interface WorkoutSet {
  warmup: boolean;
  percentageLabel: string;
  weight: number;
  reps: number;
  amrap: boolean;
  platesDisplay: string;
  repsLabel: string;
}

export interface WorkoutPlan {
  liftName: string;
  week: number;
  trainingMax: number;
  sets: WorkoutSet[];
  weekLabel: string;
}

function roundUpTo5(weight: number): number {
  return Math.ceil(weight / 5) * 5;
}

function platesDisplay(totalWeight: number): string {
  const perSide = (totalWeight - 45) / 2;
  const plateTypes = [45, 35, 25, 10, 5, 2.5];
  const plates: string[] = [];
  let remaining = perSide;

  for (const plate of plateTypes) {
    while (remaining >= plate - 0.01) {
      plates.push(Number.isInteger(plate) ? String(plate) : String(plate));
      remaining -= plate;
    }
  }

  return plates.length === 0 ? "bar only" : plates.join(", ");
}

function weekLabel(week: number): string {
  switch (week) {
    case 1: return "5s Week";
    case 2: return "3s Week";
    case 3: return "5/3/1 Week";
    case 4: return "Deload";
    default: return `Week ${week}`;
  }
}

export async function getConfig(userId: string, liftId: number) {
  return prisma.userLiftConfig.findUnique({
    where: { userId_liftId: { userId, liftId } },
  });
}

export async function createConfig(userId: string, lift: { id: number; name: string }, trainingMax: number) {
  return prisma.userLiftConfig.create({
    data: { userId, liftId: lift.id, trainingMax, currentWeek: 1 },
  });
}

export async function updateTrainingMax(
  config: { id: number; userId: string; liftId: number },
  newMax: number
) {
  await prisma.userLiftConfig.update({
    where: { id: config.id },
    data: { trainingMax: newMax },
  });
}

export async function getWeekLabels(userId: string) {
  const configs = await prisma.userLiftConfig.findMany({
    where: { userId },
  });

  const labels: Record<number, string> = {};
  for (const c of configs) {
    labels[c.liftId] = `Week ${c.currentWeek} · ${weekLabel(c.currentWeek)}`;
  }
  return labels;
}

export async function buildPlan(
  config: { currentWeek: number; trainingMax: number; liftId: number },
  lift: { name: string }
): Promise<WorkoutPlan> {
  const defs = PROGRAM[config.currentWeek - 1];
  const sets: WorkoutSet[] = defs.map((def) => {
    const weight = roundUpTo5(config.trainingMax * def.pct);
    return {
      warmup: def.warmup,
      percentageLabel: `${Math.round(def.pct * 100)}%`,
      weight,
      reps: def.reps,
      amrap: def.amrap,
      platesDisplay: platesDisplay(weight),
      repsLabel: def.amrap ? "AMRAP" : `${def.reps} reps`,
    };
  });

  return {
    liftName: lift.name,
    week: config.currentWeek,
    trainingMax: config.trainingMax,
    sets,
    weekLabel: weekLabel(config.currentWeek),
  };
}

export async function completeWorkout(
  config: { id: number; userId: string; liftId: number; currentWeek: number },
  amrapReps: number
) {
  await prisma.workoutLog.create({
    data: {
      userId: config.userId,
      liftId: config.liftId,
      week: config.currentWeek,
      amrapReps,
      completedOn: new Date().toISOString().split("T")[0],
    },
  });

  const next = (config.currentWeek % 4) + 1;
  await prisma.userLiftConfig.update({
    where: { id: config.id },
    data: { currentWeek: next },
  });
}

export async function countLogs(userId: string) {
  return prisma.workoutLog.count({ where: { userId } });
}

const CHART_COLORS = [
  "#4f9eff", "#4ade80", "#fb923c", "#a78bfa", "#f472b6",
];

export async function buildChartDatasets(userId: string) {
  const logs = await prisma.trainingMaxLog.findMany({
    where: { userId },
    orderBy: { loggedOn: "asc" },
    include: { lift: true },
  });

  const byLift = new Map<string, typeof logs>();
  for (const log of logs) {
    const name = log.lift.name;
    if (!byLift.has(name)) byLift.set(name, []);
    byLift.get(name)!.push(log);
  }

  const datasets: { label: string; color: string; points: { x: string; y: number }[] }[] = [];
  let i = 0;
  for (const [label, points] of byLift) {
    datasets.push({
      label,
      color: CHART_COLORS[i % CHART_COLORS.length],
      points: points.map((p) => ({ x: p.loggedOn, y: p.trainingMax })),
    });
    i++;
  }

  return datasets;
}
