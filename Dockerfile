FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npx tsc

FROM node:22-alpine
RUN apk add --no-cache openssl sqlite
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY src/views ./dist/views
ENV NODE_ENV=production
EXPOSE 8080
CMD ["sh", "-c", "sqlite3 /app/data/workoutapp.db 'DELETE FROM BodyWeightLog WHERE id NOT IN (SELECT MAX(id) FROM BodyWeightLog GROUP BY userId, loggedOn);' 2>/dev/null || true && npx prisma db push --accept-data-loss && node dist/index.js"]
