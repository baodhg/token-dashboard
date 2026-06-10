import { prisma } from "@/lib/db";
import { snapshotDailyBalances } from "@/lib/daily-snapshot";

// GET /api/daily-balance
// Returns all daily balance records sorted by date descending
export async function GET() {
  const rows = await prisma.dailyBalance.findMany({
    orderBy: [{ date: "desc" }, { model: "asc" }],
  });
  return Response.json(rows);
}

// POST /api/daily-balance
// Snapshots today's (and yesterday's) per-model totals from calls table
export async function POST() {
  const snapped = await snapshotDailyBalances();
  return Response.json({ snapped });
}
