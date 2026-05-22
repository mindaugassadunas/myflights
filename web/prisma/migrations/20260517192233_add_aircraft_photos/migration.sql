-- CreateTable
CREATE TABLE "aircraft_photos" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "photoUrl" TEXT,
    "thumbUrl" TEXT,
    "photographer" TEXT,
    "attributionUrl" TEXT,
    "notFound" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aircraft_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aircraft_photos_key_key" ON "aircraft_photos"("key");

-- CreateIndex
CREATE INDEX "aircraft_photos_fetchedAt_idx" ON "aircraft_photos"("fetchedAt");
