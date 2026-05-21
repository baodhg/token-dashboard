import { NextResponse } from "next/server";
import { recalculateCosts } from "@/lib/recalculate";

export async function POST() {
  try {
    const result = await recalculateCosts();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[recalculate-prices]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
