import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

const DEFAULT_SKINS = ["default"];

// GET /api/rocket-profile?player=name
// Returns profile + availableCoins (SUM(calls.cost) - spentCoins)
export async function GET(req: NextRequest) {
  const playerName = req.nextUrl.searchParams.get("player") || "";

  const [profile, costAgg] = await Promise.all([
    prisma.rocketProfile.findUnique({ where: { playerName } }),
    prisma.call.aggregate({ _sum: { cost: true } }),
  ]);

  const totalEarned = costAgg._sum.cost ?? 0;
  const spentCoins = profile?.spentCoins ?? 0;
  const availableCoins = Math.max(0, totalEarned - spentCoins);

  return Response.json({
    playerName,
    selectedSkin: profile?.selectedSkin ?? "default",
    selectedColor: profile?.selectedColor ?? null,
    flameColor: profile?.flameColor ?? null,
    unlockedSkins: profile?.unlockedSkins ?? DEFAULT_SKINS,
    spentCoins,
    totalEarned,
    availableCoins,
  });
}

// POST /api/rocket-profile
// Body: { playerName, selectedSkin, selectedColor, flameColor, unlockedSkins, spentCoins }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { playerName, selectedSkin, selectedColor, flameColor, unlockedSkins, spentCoins } = body;

  if (!playerName) {
    return Response.json({ error: "playerName required" }, { status: 400 });
  }

  const profile = await prisma.rocketProfile.upsert({
    where: { playerName },
    create: {
      playerName,
      selectedSkin: selectedSkin ?? "default",
      selectedColor: selectedColor ?? null,
      flameColor: flameColor ?? null,
      unlockedSkins: unlockedSkins ?? DEFAULT_SKINS,
      spentCoins: spentCoins ?? 0,
    },
    update: {
      ...(selectedSkin !== undefined && { selectedSkin }),
      ...(selectedColor !== undefined && { selectedColor }),
      ...(flameColor !== undefined && { flameColor }),
      ...(unlockedSkins !== undefined && { unlockedSkins }),
      ...(spentCoins !== undefined && { spentCoins }),
    },
  });

  // Return updated availableCoins
  const costAgg = await prisma.call.aggregate({ _sum: { cost: true } });
  const totalEarned = costAgg._sum.cost ?? 0;
  const availableCoins = Math.max(0, totalEarned - profile.spentCoins);

  return Response.json({ ...profile, totalEarned, availableCoins });
}
