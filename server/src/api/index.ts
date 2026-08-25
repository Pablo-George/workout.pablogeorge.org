import { Router } from "express";
import { apiErrorMiddleware, sendError } from "../lib/respond.js";
import meRoutes from "./me.js";
import homeRoutes from "./home.js";
import profileRoutes from "./profile.js";
import workoutRoutes from "./workouts.js";
import calsRoutes from "./cals.js";
import socialRoutes from "./social.js";
import usersRoutes from "./users.js";
import { GROUP_WORKOUTS_ENABLED } from "../config/features.js";
import groupRoutes from "./group.js";
import guidesRoutes from "./guides.js";
import adminRoutes from "./admin.js";

const router = Router();

router.use(meRoutes);
router.use("/home", homeRoutes);
router.use("/profile", profileRoutes);
router.use("/workouts", workoutRoutes);
router.use("/cals", calsRoutes);
router.use("/social", socialRoutes);
router.use("/users", usersRoutes);
if (GROUP_WORKOUTS_ENABLED) {
  router.use("/group", groupRoutes);
}
router.use("/guides", guidesRoutes);
router.use("/admin", adminRoutes);

// Unknown /api path: answer JSON rather than falling through to the SPA or an
// EJS route, so a typo'd endpoint never comes back as a 200 page of HTML.
router.use((_req, res) => sendError(res, 404, "Unknown endpoint"));

router.use(apiErrorMiddleware);

export default router;
