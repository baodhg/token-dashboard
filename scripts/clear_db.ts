
import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  
  console.log("🧹 Clearing sync state and calls data...");
  
  // Clear all sync records to allow re-reading files from byte 0
  const clearSync = await prisma.syncState.deleteMany({});
  console.log(`Deleted ${clearSync.count} sync state records.`);
  
  // Clear all calls to avoid duplicates and ensure clean mapping
  const clearCalls = await prisma.call.deleteMany({});
  console.log(`Deleted ${clearCalls.count} call records.`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
