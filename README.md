# workout.pablogeorge.org

Personal workout tracking app built with Node.js, Express, Prisma (SQLite), and EJS.

## Features

- **5/3/1 program tracking** — weekly set/rep/weight progression per lift, AMRAP logging, automatic training max updates
- **AI auxiliary lifts** — Gemini generates 3 accessory exercises per core lift with weight recommendations based on your training max
- **Calorie tracking** — log food via camera (AI estimates calories from photo) or manual entry; 30-day history chart on the home screen
- **Social feed** — post text and photos, add friends via shareable invite link
- **Progress charts** — training max progression and daily calorie history powered by Chart.js

## Stack

| Layer | Tech |
|---|---|
| Server | Node.js 22, Express |
| Database | SQLite via Prisma |
| Templates | EJS |
| Auth | Google OAuth 2.0 (Passport.js) |
| AI | Google Gemini 2.5 Flash via Genkit |
| Image storage | Local filesystem (dev) / AWS S3 (prod) |
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
| `AWS_ACCESS_KEY_ID` | S3 credentials (optional in dev, uploads saved locally) |
| `AWS_SECRET_ACCESS_KEY` | S3 credentials |
| `AWS_S3_BUCKET` | S3 bucket name |
| `AWS_REGION` | AWS region (default: `us-east-1`) |
| `DATABASE_URL` | Prisma DB URL (default: `file:./data/workoutapp.db`) |

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
