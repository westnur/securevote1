import { PrismaClient } from "@prisma/client";

/** Prisma uses parameterized queries for every operation, which prevents SQL injection. */
export function createPrisma(databaseUrl?: string) {
  return new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined);
}
