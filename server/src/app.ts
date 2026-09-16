import express from "express";
import session from "express-session";
import passport from "passport";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";
import ConnectSqlite3 from "connect-sqlite3";
import { APP_VERSION } from "./version.js";
import "./config/passport.js";
import authRoutes from "./routes/auth.js";
import homeRoutes from "./routes/home.js";
import workoutRoutes from "./routes/workout.js";
import socialRoutes from "./routes/social.js";
import calsRoutes from "./routes/cals.js";
import calisthenicsRoutes from "./routes/calisthenics.js";
import adminRoutes from "./routes/admin.js";
import groupRoutes from "./routes/group.js";
import musicRoutes from "./routes/music.js";
import musicApiRoutes from "./api/music.js";
import { apiErrorMiddleware } from "./lib/respond.js";
import { GROUP_WORKOUTS_ENABLED, MUSIC_ENABLED } from "./config/features.js";

// Re-exported for the EJS-era routes that still import it from here.
// New code should import from ./db.js directly.
export { prisma } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SQLiteStore = ConnectSqlite3(session);

mkdirSync("./data/uploads", { recursive: true });

const app = express();

app.set("view engine", "ejs");
app.set("views", join(__dirname, "views"));
app.locals.appVersion = APP_VERSION;

app.use(express.static(join(__dirname, "public")));
app.use("/uploads", express.static(join("./data/uploads")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    store: new SQLiteStore({ db: "sessions.db", dir: "./data" }) as session.Store,
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Feature flags exposed to all EJS views.
app.use((_req, res, next) => {
  res.locals.groupsEnabled = GROUP_WORKOUTS_ENABLED;
  next();
});

app.use(authRoutes);
app.use(homeRoutes);
app.use(workoutRoutes);
app.use(socialRoutes);
app.use(calsRoutes);
app.use(calisthenicsRoutes);
app.use(adminRoutes);
app.use(groupRoutes);
if (MUSIC_ENABLED) {
  app.use(musicRoutes);
  // The music widgets on the home and group-workout pages talk to this over
  // fetch() rather than full page posts, so it stays JSON instead of EJS.
  app.use("/api/music", musicApiRoutes, apiErrorMiddleware);
}

export default app;
