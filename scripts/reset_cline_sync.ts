import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const pool   = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const r = await prisma.syncState.deleteMany({ where: { filePath: { startsWith: "cline:" } } });
  console.log("Deleted cline syncState rows:", r.count);
  await prisma.$disconnect();
}
main().catch(console.error);
