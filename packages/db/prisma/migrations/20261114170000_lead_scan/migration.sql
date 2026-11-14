-- Lead quét MXH / khách tiềm năng đọc từ Google Sheet; chỉ tiêu Lead MXH theo tuần
CREATE TABLE "lead_scan_items" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "scanDate" DATE NOT NULL,
    "postDate" DATE,
    "platform" TEXT,
    "groupName" TEXT,
    "poster" TEXT,
    "product" TEXT,
    "quantity" TEXT,
    "area" TEXT,
    "contactInPost" TEXT,
    "link" TEXT,
    "contactDate" DATE,
    "assigneeName" TEXT,
    "assigneeId" TEXT,
    "result" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL,
    "resultKind" TEXT,
    "missing" TEXT,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lead_scan_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lead_scan_items_sourceKey_key" ON "lead_scan_items"("sourceKey");
CREATE INDEX "lead_scan_items_scanDate_idx" ON "lead_scan_items"("scanDate");
CREATE INDEX "lead_scan_items_contactDate_idx" ON "lead_scan_items"("contactDate");
CREATE INDEX "lead_scan_items_assigneeId_idx" ON "lead_scan_items"("assigneeId");

CREATE TABLE "lead_prospects" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "foundDate" DATE,
    "rank" TEXT,
    "score" INTEGER,
    "companyName" TEXT NOT NULL,
    "taxCode" TEXT,
    "industry" TEXT,
    "area" TEXT,
    "signal" TEXT,
    "products" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "sourceNote" TEXT,
    "assigneeName" TEXT,
    "assigneeId" TEXT,
    "contactDate" DATE,
    "channel" TEXT,
    "result" TEXT,
    "note" TEXT,
    "nextStep" TEXT,
    "nextDate" DATE,
    "status" TEXT NOT NULL,
    "resultKind" TEXT,
    "missing" TEXT,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lead_prospects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lead_prospects_sourceKey_key" ON "lead_prospects"("sourceKey");
CREATE INDEX "lead_prospects_origin_idx" ON "lead_prospects"("origin");
CREATE INDEX "lead_prospects_contactDate_idx" ON "lead_prospects"("contactDate");
CREATE INDEX "lead_prospects_assigneeId_idx" ON "lead_prospects"("assigneeId");

CREATE TABLE "lead_scan_logs" (
    "id" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "groups" INTEGER NOT NULL DEFAULT 0,
    "postsRead" INTEGER NOT NULL DEFAULT 0,
    "newPosts" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lead_scan_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lead_scan_logs_runDate_slot_key" ON "lead_scan_logs"("runDate", "slot");

CREATE TABLE "lead_mxh_targets" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "targetValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lead_mxh_targets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lead_mxh_targets_employeeId_weekStart_key" ON "lead_mxh_targets"("employeeId", "weekStart");
