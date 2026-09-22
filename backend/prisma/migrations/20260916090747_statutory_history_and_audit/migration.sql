/*
  Warnings:

  - You are about to drop the column `employeePF` on the `SalaryStructure` table. All the data in the column will be lost.
  - You are about to drop the column `employeeSSF` on the `SalaryStructure` table. All the data in the column will be lost.
  - You are about to drop the column `employerPF` on the `SalaryStructure` table. All the data in the column will be lost.
  - You are about to drop the column `employerSSF` on the `SalaryStructure` table. All the data in the column will be lost.
  - You are about to drop the column `base` on the `StatutoryConfig` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `StatutoryConfig` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `StatutoryConfig` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[scheme,version]` on the table `StatutoryConfig` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `scheme` to the `StatutoryConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `StatutoryConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `version` to the `StatutoryConfig` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."StatutoryScheme" AS ENUM ('SSF', 'EPF');

-- CreateEnum
CREATE TYPE "public"."StatutoryEnrollmentStatus" AS ENUM ('PENDING', 'APPLICABLE', 'NOT_APPLICABLE', 'EXEMPT', 'SUSPENDED', 'ENDED');

-- CreateEnum
CREATE TYPE "public"."StatutoryBaseType" AS ENUM ('BASIC', 'GROSS', 'BASIC_PLUS_ALLOWANCES', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."StatutoryRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'HISTORICAL', 'SUPERSEDED', 'CANCELLED');

-- DropIndex
DROP INDEX "public"."StatutoryConfig_effectiveFrom_idx";

-- DropIndex
DROP INDEX "public"."StatutoryConfig_name_key";

-- AlterTable
ALTER TABLE "public"."PayrollRecord" ADD COLUMN     "calculatedAt" TIMESTAMP(3),
ADD COLUMN     "calculatedById" INTEGER,
ADD COLUMN     "epfRuleVersion" INTEGER,
ADD COLUMN     "ssfRuleVersion" INTEGER;

-- AlterTable
ALTER TABLE "public"."SalaryStructure" DROP COLUMN "employeePF",
DROP COLUMN "employeeSSF",
DROP COLUMN "employerPF",
DROP COLUMN "employerSSF";

-- AlterTable
ALTER TABLE "public"."StatutoryConfig" DROP COLUMN "base",
DROP COLUMN "isActive",
DROP COLUMN "name",
ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "activatedById" INTEGER,
ADD COLUMN     "authority" TEXT,
ADD COLUMN     "baseDefinition" JSONB,
ADD COLUMN     "baseType" "public"."StatutoryBaseType" NOT NULL DEFAULT 'BASIC',
ADD COLUMN     "changeReason" TEXT,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "referenceNumber" TEXT,
ADD COLUMN     "scheme" "public"."StatutoryScheme" NOT NULL,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "status" "public"."StatutoryRuleStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "supersededById" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "public"."StatutoryEnrollment" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "scheme" "public"."StatutoryScheme" NOT NULL,
    "status" "public"."StatutoryEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT,
    "recordedById" INTEGER,
    "verifiedById" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatutoryEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StatutoryAuditLog" (
    "id" SERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "scheme" "public"."StatutoryScheme",
    "statutoryConfigId" INTEGER,
    "enrollmentId" INTEGER,
    "employeeId" INTEGER,
    "payrollRecordId" INTEGER,
    "performedById" INTEGER,
    "oldValues" JSONB,
    "newValues" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatutoryAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatutoryEnrollment_employeeId_scheme_idx" ON "public"."StatutoryEnrollment"("employeeId", "scheme");

-- CreateIndex
CREATE INDEX "StatutoryEnrollment_scheme_status_idx" ON "public"."StatutoryEnrollment"("scheme", "status");

-- CreateIndex
CREATE INDEX "StatutoryEnrollment_effectiveFrom_idx" ON "public"."StatutoryEnrollment"("effectiveFrom");

-- CreateIndex
CREATE INDEX "StatutoryEnrollment_effectiveTo_idx" ON "public"."StatutoryEnrollment"("effectiveTo");

-- CreateIndex
CREATE INDEX "StatutoryEnrollment_recordedById_idx" ON "public"."StatutoryEnrollment"("recordedById");

-- CreateIndex
CREATE INDEX "StatutoryEnrollment_verifiedById_idx" ON "public"."StatutoryEnrollment"("verifiedById");

-- CreateIndex
CREATE INDEX "StatutoryAuditLog_scheme_idx" ON "public"."StatutoryAuditLog"("scheme");

-- CreateIndex
CREATE INDEX "StatutoryAuditLog_statutoryConfigId_idx" ON "public"."StatutoryAuditLog"("statutoryConfigId");

-- CreateIndex
CREATE INDEX "StatutoryAuditLog_enrollmentId_idx" ON "public"."StatutoryAuditLog"("enrollmentId");

-- CreateIndex
CREATE INDEX "StatutoryAuditLog_employeeId_idx" ON "public"."StatutoryAuditLog"("employeeId");

-- CreateIndex
CREATE INDEX "StatutoryAuditLog_payrollRecordId_idx" ON "public"."StatutoryAuditLog"("payrollRecordId");

-- CreateIndex
CREATE INDEX "StatutoryAuditLog_performedById_idx" ON "public"."StatutoryAuditLog"("performedById");

-- CreateIndex
CREATE INDEX "StatutoryAuditLog_createdAt_idx" ON "public"."StatutoryAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "StatutoryAuditLog_action_idx" ON "public"."StatutoryAuditLog"("action");

-- CreateIndex
CREATE INDEX "PayrollRecord_calculatedById_idx" ON "public"."PayrollRecord"("calculatedById");

-- CreateIndex
CREATE INDEX "StatutoryConfig_scheme_effectiveFrom_idx" ON "public"."StatutoryConfig"("scheme", "effectiveFrom");

-- CreateIndex
CREATE INDEX "StatutoryConfig_scheme_effectiveTo_idx" ON "public"."StatutoryConfig"("scheme", "effectiveTo");

-- CreateIndex
CREATE INDEX "StatutoryConfig_scheme_status_idx" ON "public"."StatutoryConfig"("scheme", "status");

-- CreateIndex
CREATE INDEX "StatutoryConfig_createdById_idx" ON "public"."StatutoryConfig"("createdById");

-- CreateIndex
CREATE INDEX "StatutoryConfig_activatedById_idx" ON "public"."StatutoryConfig"("activatedById");

-- CreateIndex
CREATE UNIQUE INDEX "StatutoryConfig_scheme_version_key" ON "public"."StatutoryConfig"("scheme", "version");

-- AddForeignKey
ALTER TABLE "public"."StatutoryConfig" ADD CONSTRAINT "StatutoryConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StatutoryConfig" ADD CONSTRAINT "StatutoryConfig_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StatutoryEnrollment" ADD CONSTRAINT "StatutoryEnrollment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StatutoryAuditLog" ADD CONSTRAINT "StatutoryAuditLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
