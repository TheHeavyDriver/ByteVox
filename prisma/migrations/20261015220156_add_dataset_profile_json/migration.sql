-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Dataset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "encoding" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "rejectedCount" INTEGER NOT NULL,
    "profileJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'ready',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Dataset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Dataset" ("byteSize", "createdAt", "encoding", "id", "name", "originalFilename", "rejectedCount", "rowCount", "status", "storagePath", "userId") SELECT "byteSize", "createdAt", "encoding", "id", "name", "originalFilename", "rejectedCount", "rowCount", "status", "storagePath", "userId" FROM "Dataset";
DROP TABLE "Dataset";
ALTER TABLE "new_Dataset" RENAME TO "Dataset";
CREATE INDEX "Dataset_userId_idx" ON "Dataset"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
