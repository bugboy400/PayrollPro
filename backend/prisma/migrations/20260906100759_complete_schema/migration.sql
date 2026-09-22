/*
  Warnings:

  - The values [APPROVED] on the enum `PayrollStatus` will be removed. If these variants are still used in the database, this will fail.
  - The `status` column on the `Attendance` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `approvedAt` on the `PayrollPeriod` table. All the data in the column will be lost.
  - You are about to drop the column `endDate` on the `PayrollPeriod` table. All the data in the column will be lost.
  - You are about to drop the column `processedAt` on the `PayrollPeriod` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `PayrollPeriod` table. All the data in the column will be lost.
  - You are about to drop the column `fiscalYear` on the `TaxBracket` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `TaxBracket` table. All the data in the column will be lost.
  - You are about to drop the `PayrollItem` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[year,month]` on the table `PayrollPeriod` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `effectiveFrom` to the `TaxBracket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `label` to the `TaxBracket` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "public"."ApprovalType" AS ENUM ('PAYROLL', 'LEAVE', 'SALARY', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."PerformanceStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
BEGIN;
CREATE TYPE "public"."PayrollStatus_new" AS ENUM ('DRAFT', 'PROCESSING', 'PROCESSED', 'HR_APPROVED', 'ADMIN_APPROVED', 'PAID', 'LOCKED');
ALTER TABLE "public"."PayrollPeriod" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."PayrollPeriod" ALTER COLUMN "status" TYPE "public"."PayrollStatus_new" USING ("status"::text::"public"."PayrollStatus_new");
ALTER TYPE "public"."PayrollStatus" RENAME TO "PayrollStatus_old";
ALTER TYPE "public"."PayrollStatus_new" RENAME TO "PayrollStatus";
DROP TYPE "public"."PayrollStatus_old";
ALTER TABLE "public"."PayrollPeriod" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."PayrollItem" DROP CONSTRAINT "PayrollItem_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PayrollItem" DROP CONSTRAINT "PayrollItem_payrollPeriodId_fkey";

-- DropIndex
DROP INDEX "public"."PayrollPeriod_month_year_key";

-- DropIndex
DROP INDEX "public"."TaxBracket_fiscalYear_idx";

-- AlterTable
ALTER TABLE "public"."Attendance" ADD COLUMN     "remarks" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "public"."AttendanceStatus" NOT NULL DEFAULT 'PRESENT';

-- AlterTable
ALTER TABLE "public"."Employee" ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "profilePhotoUrl" TEXT;

-- AlterTable
ALTER TABLE "public"."LeaveRequest" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" INTEGER;

-- AlterTable
ALTER TABLE "public"."PayrollPeriod" DROP COLUMN "approvedAt",
DROP COLUMN "endDate",
DROP COLUMN "processedAt",
DROP COLUMN "startDate",
ADD COLUMN     "adminApprovedAt" TIMESTAMP(3),
ADD COLUMN     "adminApprovedById" INTEGER,
ADD COLUMN     "hrApprovedAt" TIMESTAMP(3),
ADD COLUMN     "hrApprovedById" INTEGER,
ADD COLUMN     "lockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."TaxBracket" DROP COLUMN "fiscalYear",
DROP COLUMN "name",
ADD COLUMN     "effectiveFrom" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fixedTax" DECIMAL(14,2) DEFAULT 0,
ADD COLUMN     "label" TEXT NOT NULL;

-- DropTable
DROP TABLE "public"."PayrollItem";

-- CreateTable
CREATE TABLE "public"."SalaryChange" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "previousBasic" DECIMAL(14,2) NOT NULL,
    "newBasic" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "changedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayrollRecord" (
    "id" SERIAL NOT NULL,
    "periodId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "basic" DECIMAL(14,2) NOT NULL,
    "allowances" DECIMAL(14,2) NOT NULL,
    "overtime" DECIMAL(14,2) NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "employeeSSF" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employerSSF" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employeePF" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employerPF" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PayrollRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payslip" (
    "id" SERIAL NOT NULL,
    "payrollRecordId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApprovalRequest" (
    "id" SERIAL NOT NULL,
    "type" "public"."ApprovalType" NOT NULL,
    "status" "public"."ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" INTEGER NOT NULL,
    "reviewerId" INTEGER,
    "entity" TEXT,
    "entityId" TEXT,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PerformanceCycle" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "public"."PerformanceStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PerformanceGoal" (
    "id" SERIAL NOT NULL,
    "cycleId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weight" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "target" DECIMAL(14,2),
    "actual" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmployeeKPI" (
    "id" SERIAL NOT NULL,
    "goalId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "score" DECIMAL(8,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeKPI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PerformanceReview" (
    "id" SERIAL NOT NULL,
    "cycleId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "selfComment" TEXT,
    "selfRating" DECIMAL(8,2),
    "managerComment" TEXT,
    "managerRating" DECIMAL(8,2),
    "finalScore" DECIMAL(8,2),
    "grade" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalaryChange_employeeId_idx" ON "public"."SalaryChange"("employeeId");

-- CreateIndex
CREATE INDEX "SalaryChange_changedById_idx" ON "public"."SalaryChange"("changedById");

-- CreateIndex
CREATE INDEX "SalaryChange_effectiveFrom_idx" ON "public"."SalaryChange"("effectiveFrom");

-- CreateIndex
CREATE INDEX "PayrollRecord_employeeId_idx" ON "public"."PayrollRecord"("employeeId");

-- CreateIndex
CREATE INDEX "PayrollRecord_periodId_idx" ON "public"."PayrollRecord"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRecord_periodId_employeeId_key" ON "public"."PayrollRecord"("periodId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_payrollRecordId_key" ON "public"."Payslip"("payrollRecordId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_idx" ON "public"."ApprovalRequest"("status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_type_idx" ON "public"."ApprovalRequest"("type");

-- CreateIndex
CREATE INDEX "ApprovalRequest_createdAt_idx" ON "public"."ApprovalRequest"("createdAt");

-- CreateIndex
CREATE INDEX "PerformanceCycle_year_idx" ON "public"."PerformanceCycle"("year");

-- CreateIndex
CREATE INDEX "PerformanceCycle_status_idx" ON "public"."PerformanceCycle"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceCycle_name_year_key" ON "public"."PerformanceCycle"("name", "year");

-- CreateIndex
CREATE INDEX "PerformanceGoal_cycleId_idx" ON "public"."PerformanceGoal"("cycleId");

-- CreateIndex
CREATE INDEX "PerformanceGoal_employeeId_idx" ON "public"."PerformanceGoal"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeKPI_goalId_idx" ON "public"."EmployeeKPI"("goalId");

-- CreateIndex
CREATE INDEX "EmployeeKPI_employeeId_idx" ON "public"."EmployeeKPI"("employeeId");

-- CreateIndex
CREATE INDEX "PerformanceReview_employeeId_idx" ON "public"."PerformanceReview"("employeeId");

-- CreateIndex
CREATE INDEX "PerformanceReview_cycleId_idx" ON "public"."PerformanceReview"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceReview_cycleId_employeeId_key" ON "public"."PerformanceReview"("cycleId", "employeeId");

-- CreateIndex
CREATE INDEX "Attendance_employeeId_idx" ON "public"."Attendance"("employeeId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "public"."AuditLog"("userId");

-- CreateIndex
CREATE INDEX "Holiday_holidayDate_idx" ON "public"."Holiday"("holidayDate");

-- CreateIndex
CREATE INDEX "LeaveBalance_employeeId_idx" ON "public"."LeaveBalance"("employeeId");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "public"."LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "PayrollPeriod_status_idx" ON "public"."PayrollPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_year_month_key" ON "public"."PayrollPeriod"("year", "month");

-- CreateIndex
CREATE INDEX "StatutoryConfig_effectiveFrom_idx" ON "public"."StatutoryConfig"("effectiveFrom");

-- CreateIndex
CREATE INDEX "TaxBracket_effectiveFrom_idx" ON "public"."TaxBracket"("effectiveFrom");

-- CreateIndex
CREATE INDEX "TaxBracket_isActive_idx" ON "public"."TaxBracket"("isActive");

-- CreateIndex
CREATE INDEX "TaxBracket_lowerBound_idx" ON "public"."TaxBracket"("lowerBound");

-- AddForeignKey
ALTER TABLE "public"."LeaveRequest" ADD CONSTRAINT "LeaveRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryChange" ADD CONSTRAINT "SalaryChange_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryChange" ADD CONSTRAINT "SalaryChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_hrApprovedById_fkey" FOREIGN KEY ("hrApprovedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_adminApprovedById_fkey" FOREIGN KEY ("adminApprovedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollRecord" ADD CONSTRAINT "PayrollRecord_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "public"."PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollRecord" ADD CONSTRAINT "PayrollRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payslip" ADD CONSTRAINT "Payslip_payrollRecordId_fkey" FOREIGN KEY ("payrollRecordId") REFERENCES "public"."PayrollRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "public"."PerformanceCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmployeeKPI" ADD CONSTRAINT "EmployeeKPI_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."PerformanceGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmployeeKPI" ADD CONSTRAINT "EmployeeKPI_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PerformanceReview" ADD CONSTRAINT "PerformanceReview_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "public"."PerformanceCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
