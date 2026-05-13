import express from "express";
import session from "express-session";
import passport from "passport";
import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";
import ConnectSqlite3 from "connect-sqlite3";
import "./config/passport.js";
import authRoutes from "./routes/auth.js";
import homeRoutes from "./routes/home.js";
import workoutRoutes from "./routes/workout.js";
import socialRoutes from "./routes/social.js";
import calsRoutes from "./routes/cals.js";

export const prisma = new PrismaClient();

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQLiteStore = ConnectSqlite3(session);

mkdirSync("./data/uploads", { recursive: true });

const app = express();

app.set("view engine", "ejs");
app.set("views", join(__dirname, "views"));

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

app.use(authRoutes);
app.use(homeRoutes);
app.use(workoutRoutes);
app.use(socialRoutes);
app.use(calsRoutes);

export default app;
