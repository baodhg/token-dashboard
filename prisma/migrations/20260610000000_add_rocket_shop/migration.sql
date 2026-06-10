-- CreateTable
CREATE TABLE "rocket_profiles" (
    "playerName" TEXT NOT NULL,
    "selectedSkin" TEXT NOT NULL DEFAULT 'default',
    "selectedColor" TEXT,
    "flameColor" TEXT,
    "unlockedSkins" TEXT[] NOT NULL DEFAULT ARRAY['default']::TEXT[],
    "spentCoins" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rocket_profiles_pkey" PRIMARY KEY ("playerName")
);

-- CreateTable
CREATE TABLE "daily_balances" (
    "date" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "dailyCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dailyTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_balances_pkey" PRIMARY KEY ("date","model","source")
);
