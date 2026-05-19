-- CreateTable
CREATE TABLE "price_configs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "modelPattern" TEXT NOT NULL,
    "unitPriceInput" DOUBLE PRECISION NOT NULL,
    "unitPriceOutput" DOUBLE PRECISION NOT NULL,
    "unitPriceCache" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "version" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_configs_pkey" PRIMARY KEY ("id")
);
