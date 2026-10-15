-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "encoding" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "rejectedCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Dataset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DatasetColumn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "guessedType" TEXT NOT NULL,
    "statsJson" TEXT NOT NULL,
    CONSTRAINT "DatasetColumn_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DatasetRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "dataJson" TEXT NOT NULL,
    CONSTRAINT "DatasetRow_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RejectedRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "rawSnippet" TEXT NOT NULL,
    CONSTRAINT "RejectedRow_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "datasetId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "filterJson" TEXT NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Report_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "specJson" TEXT NOT NULL,
    CONSTRAINT "Block_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "ShareLink_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summaryJson" TEXT NOT NULL,
    CONSTRAINT "ReportRevision_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Dataset_userId_idx" ON "Dataset"("userId");

-- CreateIndex
CREATE INDEX "DatasetColumn_datasetId_idx" ON "DatasetColumn"("datasetId");

-- CreateIndex
CREATE INDEX "DatasetRow_datasetId_idx" ON "DatasetRow"("datasetId");

-- CreateIndex
CREATE INDEX "RejectedRow_datasetId_idx" ON "RejectedRow"("datasetId");

-- CreateIndex
CREATE INDEX "Report_userId_idx" ON "Report"("userId");

-- CreateIndex
CREATE INDEX "Block_reportId_idx" ON "Block"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ShareLink_reportId_idx" ON "ShareLink"("reportId");

-- CreateIndex
CREATE INDEX "ReportRevision_reportId_idx" ON "ReportRevision"("reportId");
