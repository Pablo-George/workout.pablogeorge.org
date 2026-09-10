import { Router } from "express";
import type { CalorieEntry } from "@prisma/client";
import { prisma } from "../db.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { badRequest, handler, intParam, notFound, sendData } from "../lib/respond.js";
import { uploadImageField } from "../lib/upload.js";
import { estimateCalories, estimateCaloriesFromText } from "../services/calService.js";
import { uploadImage } from "../services/imageStorageService.js";
import { resolveLocalDate } from "../lib/dates.js";

const router = Router();

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

/** The AI breakdown is stored as a JSON string. The old template parsed it
 *  inline with no error handling, so one malformed row broke the whole page. */
function parseBreakdown(raw: string | null): unknown[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toEntry(e: CalorieEntry) {
  return {
    id: e.id,
    description: e.description,
    calories: e.calories,
    proteinG: e.proteinG,
    carbsG: e.carbsG,
    breakdown: parseBreakdown(e.breakdown),
    imageUrl: e.imageUrl,
    loggedOn: e.loggedOn,
    createdAt: e.createdAt,
  };
}

const sum = <T>(rows: T[], pick: (r: T) => number) => rows.reduce((t, r) => t + pick(r), 0);

function totals(entries: CalorieEntry[]) {
  return {
    calories: sum(entries, (e) => e.calories),
    proteinG: sum(entries, (e) => e.proteinG ?? 0),
    carbsG: sum(entries, (e) => e.carbsG ?? 0),
  };
}

/** Today's entries plus the previous 29 days grouped by date. */
router.get(
  "/",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    // The client passes its own local calendar day (the server's UTC day can
    // be a day off around midnight), so "today's" bucket lines up with what
    // the user actually considers today.
    const day = resolveLocalDate(req.query?.date);

    const entries = await prisma.calorieEntry.findMany({
      where: { userId, loggedOn: { gte: isoDaysAgo(29) } },
      orderBy: { createdAt: "asc" },
    });

    const todays = entries.filter((e) => e.loggedOn === day);

    const byDay = new Map<string, CalorieEntry[]>();
    for (const entry of entries) {
      if (entry.loggedOn === day) continue;
      const bucket = byDay.get(entry.loggedOn);
      if (bucket) bucket.push(entry);
      else byDay.set(entry.loggedOn, [entry]);
    }

    sendData(res, {
      today: { date: day, entries: todays.map(toEntry), totals: totals(todays) },
      // Dates stay raw; the client formats "Yesterday" / "Mon, Jan 5" so it
      // stays correct as the day rolls over without a refetch.
      history: [...byDay]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, rows]) => ({
          date,
          entries: rows.map(toEntry),
          totals: totals(rows),
        })),
    });
  }),
);

/**
 * Log an entry. Three paths: a manual calorie count, an AI estimate from a
 * photo, or an AI estimate from a text description.
 */
router.post(
  "/",
  requireAuth,
  uploadImageField,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const file = req.file;
    const context = String(req.body?.context ?? "").trim() || undefined;
    const manual = Number(req.body?.calories);
    const hasManual = Number.isFinite(manual) && manual > 0;

    if (!file && !context) throw badRequest("Add a photo or a description");

    const imageUrl = file ? await uploadImage(file) : null;

    let description: string;
    let calories: number;
    let proteinG: number | null = null;
    let carbsG: number | null = null;
    let breakdown: string | null = null;

    if (hasManual) {
      description = context ?? "Food entry";
      calories = Math.round(manual);
    } else {
      const estimate = file
        ? await estimateCalories(file.buffer, file.mimetype, context)
        : await estimateCaloriesFromText(context!);
      description = estimate.description;
      calories = estimate.calories;
      proteinG = estimate.proteinG;
      carbsG = estimate.carbsG;
      breakdown = JSON.stringify(estimate.breakdown);
    }

    const entry = await prisma.calorieEntry.create({
      data: {
        userId,
        description,
        calories,
        proteinG,
        carbsG,
        breakdown,
        imageUrl,
        loggedOn: resolveLocalDate(req.body?.loggedOn),
      },
    });

    sendData(res, toEntry(entry), 201);
  }),
);

router.patch(
  "/:id",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const id = intParam(req.params.id);

    const entry = await prisma.calorieEntry.findFirst({ where: { id, userId } });
    if (!entry) throw notFound("Entry not found");

    // Only fields actually present in the body are touched. The old handler
    // reset protein and carbs to null whenever they failed to parse.
    const body = req.body ?? {};
    const patch: { description?: string; calories?: number; proteinG?: number | null; carbsG?: number | null } = {};

    if (body.description !== undefined) {
      const description = String(body.description).trim();
      if (!description) throw badRequest("Description cannot be empty");
      patch.description = description;
    }
    if (body.calories !== undefined) {
      const calories = Number(body.calories);
      if (!Number.isFinite(calories) || calories < 0) throw badRequest("Invalid calories");
      patch.calories = Math.round(calories);
    }
    for (const key of ["proteinG", "carbsG"] as const) {
      if (body[key] === undefined) continue;
      if (body[key] === null || body[key] === "") {
        patch[key] = null;
        continue;
      }
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < 0) throw badRequest(`Invalid ${key}`);
      patch[key] = Math.round(value);
    }

    const updated = await prisma.calorieEntry.update({ where: { id }, data: patch });
    sendData(res, toEntry(updated));
  }),
);

router.delete(
  "/:id",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const id = intParam(req.params.id);

    const { count } = await prisma.calorieEntry.deleteMany({ where: { id, userId } });
    if (count === 0) throw notFound("Entry not found");

    res.status(204).end();
  }),
);

export default router;
