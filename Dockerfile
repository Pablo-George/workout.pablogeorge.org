FROM node:22-alpine AS build
WORKDIR /app
# Workspace manifests first so npm ci can resolve the tree before sources land.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY server ./server
COPY client ./client
RUN npm run build -w client && npm run build -w server

FROM node:22-alpine
RUN apk add --no-cache openssl sqlite
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/prisma ./prisma
# tsc does not process EJS, so the remaining templates are copied verbatim.
COPY server/src/views ./server/dist/views
ENV NODE_ENV=production
EXPOSE 8080
CMD ["sh", "-c", "sqlite3 /app/data/workoutapp.db 'DELETE FROM BodyWeightLog WHERE id NOT IN (SELECT MAX(id) FROM BodyWeightLog GROUP BY userId, loggedOn);' 2>/dev/null || true && npx prisma db push --accept-data-loss && node server/dist/index.js"]
