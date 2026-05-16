import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

// schema v2 — clear stale singleton after prisma generate so hot-reload picks up new fields
const SCHEMA_VER = "2";
const g = globalThis as unknown as { prisma?: PrismaClient; prismaVer?: string };
if (g.prismaVer !== SCHEMA_VER) { g.prisma = undefined; g.prismaVer = SCHEMA_VER; }

export const prisma = g.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") g.prisma = prisma;
