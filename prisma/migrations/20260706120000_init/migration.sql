-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN,
    "emailVerified" BOOLEAN,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSuggestionCache" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "contentLocale" TEXT NOT NULL DEFAULT 'en',
    "inputHash" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "suggestedDescription" TEXT NOT NULL,
    "suggestedSeoTitle" TEXT NOT NULL,
    "suggestedSeoDescription" TEXT NOT NULL,
    "suggestedAltText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSuggestionCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSubscription" (
    "shop" TEXT NOT NULL,
    "planId" TEXT NOT NULL DEFAULT 'free',
    "aiCreditsUsed" INTEGER NOT NULL DEFAULT 0,
    "aiCreditsLimit" INTEGER NOT NULL DEFAULT 10,
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimatedAiCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shopifySubscriptionId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopSubscription_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT,
    "contentLocale" TEXT,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSuggestionCache_shop_idx" ON "AiSuggestionCache"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "AiSuggestionCache_shop_productId_contentLocale_key" ON "AiSuggestionCache"("shop", "productId", "contentLocale");

-- CreateIndex
CREATE INDEX "AiUsageEvent_shop_createdAt_idx" ON "AiUsageEvent"("shop", "createdAt");
