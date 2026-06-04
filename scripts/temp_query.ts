import { config } from "dotenv";
config();
import { prisma } from "../lib/db";

async function main() {
  const calls = await prisma.call.findMany({
    where: { source: 'gemini' },
    orderBy: { timestamp: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(calls, null, 2));
}

main().finally(() => prisma.$disconnect());
