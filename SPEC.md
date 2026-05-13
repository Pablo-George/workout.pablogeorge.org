# Workout App — Product Specification

## Overview

A full-stack TypeScript/Express web application for tracking strength training workouts using the 5/3/1 program. Users log lifts, track body weight over time, and share workouts with friends on a social feed. Authentication is handled via Google OAuth.

**Stack:** Node.js · Express · TypeScript · Prisma · SQLite · EJS · AWS S3 · Google OAuth

---

## Data Models

### UserProfile
| Field | Type | Notes |
|---|---|---|
| `userId` | String (PK) | Email address from Google OAuth |
| `displayName` | String | Full name from Google |
| `pictureUrl` | String? | Profile photo URL from Google |

### CoreWorkout (Lift)
| Field | Type | Notes |
|---|---|---|
| `id` | Int (PK) | |
| `name` | String | e.g. "Bench Press", "Squat" |
| `userId` | String | Owner |

Constraint: `(userId, name)` unique — no duplicate lift names per user.

### UserLiftConfig
| Field | Type | Notes |
|---|---|---|
| `id` | Int (PK) | |
| `userId` | String | |
| `liftId` | Int (FK) | |
| `trainingMax` | Float | Current 1RM estimate used for programming |
| `currentWeek` | Int | 1–4, position in the 4-week cycle |

Constraint: `(userId, liftId)` unique.

### WorkoutLog
| Field | Type | Notes |
|---|---|---|
| `id` | Int (PK) | |
| `userId` | String | |
| `liftId` | Int (FK) | |
| `week` | Int | Week completed (1–4) |
| `amrapReps` | Int | Reps completed on the AMRAP set |
| `completedOn` | String | YYYY-MM-DD |

### TrainingMaxLog
| Field | Type | Notes |
|---|---|---|
| `id` | Int (PK) | |
| `userId` | String | |
| `liftId` | Int (FK) | |
| `trainingMax` | Float | Value at time of change |
| `loggedOn` | String | YYYY-MM-DD |

### BodyWeightLog
| Field | Type | Notes |
|---|---|---|
| `id` | Int (PK) | |
| `userId` | String | |
| `weightLbs` | Float | |
| `loggedOn` | String | YYYY-MM-DD |

### Post
| Field | Type | Notes |
|---|---|---|
| `id` | Int (PK) | |
| `authorId` | String | |
| `content` | String? | Text content |
| `imageUrl` | String? | S3 URL |
| `createdAt` | DateTime | |

### Friendship
| Field | Type | Notes |
|---|---|---|
| `id` | Int (PK) | |
| `requesterId` | String | User who sent the request |
| `addresseeId` | String | User who received the request |
| `status` | Enum | `PENDING` or `ACCEPTED` |
| `createdAt` | DateTime | |

Constraint: `(requesterId, addresseeId)` unique.

---

## Routes

### Auth
| Method | Path | Description |
|---|---|---|
| GET | `/login` | Login page |
| GET | `/auth/google` | Initiate Google OAuth |
| GET | `/auth/google/callback` | OAuth callback → redirect to `/` or `/login` |
| POST | `/logout` | Destroy session → redirect to `/login` |

### Home (all protected)
| Method | Path | Description |
|---|---|---|
| GET | `/` | Home dashboard |
| POST | `/profile/lifts` | Create a new lift |
| POST | `/profile/lifts/delete` | Delete a lift |
| POST | `/profile/weight` | Log body weight |

### Workout (all protected)
| Method | Path | Description |
|---|---|---|
| GET | `/workout/:liftId` | View workout plan for a lift |
| POST | `/workout/:liftId/setup` | Initialize lift with a training max |
| POST | `/workout/:liftId/update-tm` | Update training max |
| POST | `/workout/:liftId/complete` | Log completed workout, advance week |

### Social (all protected)
| Method | Path | Description |
|---|---|---|
| POST | `/social/post` | Create a post (text + optional image) |
| POST | `/social/friends/request` | Send a friend request by email |
| POST | `/social/friends/accept/:id` | Accept a pending friend request |
| POST | `/social/friends/reject/:id` | Reject or cancel a friend request |

---

## The 5/3/1 Program

Four-week repeating cycle. Each week has 5 sets per lift. Weights are calculated as a percentage of the user's training max and rounded up to the nearest 5 lbs.

| Week | Label | Sets (% of TM × reps) |
|---|---|---|
| 1 | 5s Week | 50×5, 50×5, 65×5, 75×5, **85×AMRAP** |
| 2 | 3s Week | 50×5, 50×5, 70×5, 80×3, **90×AMRAP** |
| 3 | 5/3/1 Week | 50×5, 50×5, 75×3, 85×3, **95×AMRAP** |
| 4 | Deload | 40×5, 40×5, 50×5, 60×5, **70×AMRAP** |

The final set of each workout is AMRAP (as many reps as possible). After logging completion, `currentWeek` advances: 1→2→3→4→1.

The workout page displays each set's weight, reps, and the plate configuration needed (e.g. "45, 35, 10, 2.5").

---

## Core Workflows

### 1. Sign In
1. User visits `/login`.
2. Clicks "Sign in with Google" → redirected to Google OAuth.
3. On success, `UserProfile` is created or updated (email as `userId`, display name, picture).
4. Session created; redirected to `/`.

### 2. First Visit — Default Lifts
When a user first visits `/`, the app auto-creates four lifts: **Bench Press**, **Squat**, **Deadlift**, **Overhead Press**.

### 3. Set Up a Lift
1. User clicks a lift on the dashboard.
2. If no `UserLiftConfig` exists, a setup form is shown.
3. User enters their training max.
4. App creates `UserLiftConfig` (week 1) and a `TrainingMaxLog` entry.
5. Redirected to `/workout/:liftId` showing Week 1 plan.

### 4. Complete a Workout
1. User views the workout plan for a lift (sets, weights, plate layouts).
2. User completes the sets and enters AMRAP reps.
3. App creates a `WorkoutLog` entry.
4. `currentWeek` advances (mod 4 cycle).
5. Redirected to home dashboard.

### 5. Update Training Max
1. User opens a lift's workout page.
2. Submits a new training max via the update form.
3. App updates `UserLiftConfig.trainingMax` and creates a new `TrainingMaxLog`.
4. All future planned weights reflect the updated max.

### 6. Log Body Weight
1. User submits weight on the home dashboard profile tab.
2. App creates a `BodyWeightLog` with today's date.
3. Latest weight is shown on the dashboard.

### 7. Create a Post
1. User submits text and/or an image (JPEG, PNG, GIF, WebP; max 10 MB).
2. If an image is attached, it is uploaded to S3 and the public URL is stored.
3. A `Post` record is created.
4. Post appears on the user's own feed and their friends' feeds.

### 8. Friend Requests
1. **Send:** User enters a friend's email. App creates a `Friendship` with `PENDING` status.
   - Blocked if: self-request, or a relationship already exists.
2. **Accept:** Addressee clicks accept → status updated to `ACCEPTED`.
3. **Reject/Cancel:** Either party can delete the record.

### 9. Social Feed
- Displays up to 50 most recent posts from the user and their accepted friends.
- Each post shows: author avatar, name, "time ago" timestamp, text, and image (if any).

---

## Services

### workoutService
- `getConfig(userId, liftId)` — fetch `UserLiftConfig`
- `createConfig(userId, lift, trainingMax)` — initialize lift, create first `TrainingMaxLog`
- `updateTrainingMax(config, newMax)` — update config + log
- `completeWorkout(config, amrapReps)` — create `WorkoutLog`, advance week
- `buildPlan(config, lift)` — generate full workout plan (weights, reps, plates)
- `buildChartDatasets(userId)` — training max history per lift for charts
- `getWeekLabels(userId)` — current week label per lift (e.g. "Week 2 · 3s Week")
- `countLogs(userId)` — total completed workouts

### imageStorageService
- `uploadImage(file)` — validates type, uploads to S3, returns public URL
- Required env vars: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default: 8080) |
| `SESSION_SECRET` | Express session secret |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | OAuth callback URL |
| `AWS_REGION` | S3 region |
| `AWS_ACCESS_KEY_ID` | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `AWS_S3_BUCKET` | S3 bucket name for post images |

---

## Session & Auth

- Sessions stored in SQLite via `connect-sqlite3`, 7-day max age.
- All routes except `/login` and `/auth/*` require authentication.
- `ensureAuth` middleware redirects unauthenticated requests to `/login`.
- Passport serializes/deserializes by `userId` (email).
