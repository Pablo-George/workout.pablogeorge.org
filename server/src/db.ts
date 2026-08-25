import { PrismaClient } from "@prisma/client";

// Kept off app.ts so services don't have to import the HTTP layer to reach the
// database. Guarded on globalThis so tsx watch reloads don't leak clients, and
// so a Lambda warm start reuses the connection instead of opening another.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma =
  globalForPrisma.__prisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;
