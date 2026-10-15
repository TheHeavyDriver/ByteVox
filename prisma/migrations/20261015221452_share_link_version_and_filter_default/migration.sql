-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "datasetId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "filterJson" TEXT NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Report_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Report" ("createdAt", "datasetId", "description", "filterJson", "id", "title", "updatedAt", "userId", "version") SELECT "createdAt", "datasetId", "description", "filterJson", "id", "title", "updatedAt", "userId", "version" FROM "Report";
DROP TABLE "Report";
ALTER TABLE "new_Report" RENAME TO "Report";
CREATE INDEX "Report_userId_idx" ON "Report"("userId");
CREATE TABLE "new_ShareLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "versionAtShare" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ShareLink_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShareLink" ("createdAt", "expiresAt", "id", "reportId", "revokedAt", "tokenHash") SELECT "createdAt", "expiresAt", "id", "reportId", "revokedAt", "tokenHash" FROM "ShareLink";
DROP TABLE "ShareLink";
ALTER TABLE "new_ShareLink" RENAME TO "ShareLink";
CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");
CREATE INDEX "ShareLink_reportId_idx" ON "ShareLink"("reportId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
