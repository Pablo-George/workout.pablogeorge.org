# workout.pablogeorge.org

Personal workout tracking app built with Node.js, Express, Prisma (SQLite), and EJS.

## Features

- **5/3/1 program tracking** — weekly set/rep/weight progression per lift, AMRAP logging, automatic training max updates
- **AI auxiliary lifts** — Gemini generates 3 accessory exercises per core lift with weight recommendations based on your training max
- **Calorie tracking** — log food via camera (AI estimates calories from photo) or manual entry; 30-day history chart on the home screen
- **Social feed** — post text and photos, add friends via shareable invite link
- **Workout music** — connect Spotify or Apple Music, auto-start a selected playlist, publish playlists, show live listening to friends, and share a PR with its song
- **Progress charts** — training max progression and daily calorie history powered by Chart.js

## App experience

The mobile interface follows the dark app references in `Reference pics/`: charcoal surfaces, orange actions, an activity feed, and floating navigation. The shared visual theme lives in `server/src/views/partials/app-theme.ejs`.

- **Home:** friends' posts and personal records, weekly activity markers, and quick workout recording.
- **You:** Progress, searchable Activities (including a personal-record filter), a Gallery of your own posted photos, and More.
- **Progress:** a 12-week session chart, weekly AMRAP totals, records, and a calendar sheet with daily details. A streak means consecutive Monday–Sunday weeks with a logged workout; the current week can still be in progress.
- **Create:** record a workout, publish a text/photo post, or log nutrition. Sharing uses the device share sheet with a copy-link fallback; posts retain their existing access rules.
- **Settings:** edit your display name, manage lifts, and update body-weight privacy. Custom display names survive subsequent Google sign-ins.

Run `npm test` for training-summary tests and `npm run typecheck` for TypeScript checks. These features use existing workout and post records and require no database migration.

## Stack

| Layer | Tech |
|---|---|
| Server | Node.js 22, Express |
| Database | SQLite via Prisma |
| Templates | EJS |
| Auth | Google OAuth 2.0 (Passport.js) |
| AI | Google Gemini 2.5 Flash via Genkit |
| Image storage | Local filesystem (persisted on PVC) |
| Container | Docker, published to GHCR |
| Deployment | k3s (Kubernetes) |

## Local development

```bash
cp .env.example .env   # fill in values
npm install
npx prisma db push
npm run dev
```

Runs on `http://localhost:3000` by default. Set `PORT` to override.

### Required environment variables

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | OAuth redirect URI (e.g. `http://localhost:3000/auth/google/callback`) |
| `SESSION_SECRET` | Long random string for session signing |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `DATABASE_URL` | Prisma DB URL (default: `file:./data/workoutapp.db`) |
| `MUSIC_ENABLED` | Set to `true` to expose music integrations; defaults to off |
| `MUSIC_TOKEN_ENCRYPTION_KEY` | Long random secret used to encrypt provider tokens at rest |
| `SPOTIFY_CLIENT_ID` | Spotify Web API application client ID (optional) |
| `SPOTIFY_CLIENT_SECRET` | Spotify Web API application client secret (optional) |
| `SPOTIFY_CALLBACK_URL` | Exact allowlisted callback, e.g. `https://workout.example.com/music/spotify/callback` |
| `APPLE_MUSIC_TEAM_ID` | Apple Developer team ID (optional) |
| `APPLE_MUSIC_KEY_ID` | MusicKit private key ID (optional) |
| `APPLE_MUSIC_PRIVATE_KEY` | MusicKit `.p8` private key; literal newlines or `\\n` are supported |

Music is disabled by default, so the app can ship without provider credentials. To enable it later, set `MUSIC_ENABLED=true` and configure at least one provider. Spotify remote playback requires Premium and an active Spotify device. Apple Music requires an Apple Developer Program MusicKit key and an active Apple Music subscription.

## Deployment

On every push to `master`, GitHub Actions builds and pushes a Docker image to GHCR:

```
ghcr.io/pablo-george/workout.pablogeorge.org:latest
ghcr.io/pablo-george/workout.pablogeorge.org:sha-<commit>
```

### k3s

```bash
# 1. Fill in credentials
cp k8s/secret.yaml k8s/secret.local.yaml
vim k8s/secret.local.yaml
kubectl apply -f k8s/secret.local.yaml

# 2. Deploy
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/ingress.yaml
```

App runs at `workout.pablogeorge.org`. SQLite and uploads are persisted on a 2Gi PVC.
