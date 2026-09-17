import { Router } from "express";
import authApiRoutes from "./auth.js";
import workoutsApiRoutes from "./workouts.js";
import calisthenicsApiRoutes from "./calisthenics.js";
import runningApiRoutes from "./running.js";
import socialApiRoutes from "./social.js";
import profileApiRoutes from "./profile.js";
import calsApiRoutes from "./cals.js";

// The JSON API consumed by the native iOS app. /api/music is mounted
// separately in app.ts (behind the MUSIC_ENABLED flag, same as before this
// existed). Group workout rooms, the admin panel, and music account-linking
// aren't exposed as JSON yet — those stay web/HTMX-only for now.
const router = Router();
router.use("/auth", authApiRoutes);
router.use("/workouts", workoutsApiRoutes);
router.use("/calisthenics", calisthenicsApiRoutes);
router.use("/running", runningApiRoutes);
router.use("/social", socialApiRoutes);
router.use("/profile", profileApiRoutes);
router.use("/cals", calsApiRoutes);

export default router;
