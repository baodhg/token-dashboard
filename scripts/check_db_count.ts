
import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const count = await prisma.call.count();
  console.log('Total calls in DB:', count);
  
  const sourceCounts = await prisma.call.groupBy({
    by: ['source'],
    _count: true,
  });
  console.log('Calls by source:', JSON.stringify(sourceCounts, null, 2));
  
  await prisma.$disconnect();
}

main().catch(console.error);
