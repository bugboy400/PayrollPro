/*
  Warnings:

  - You are about to drop the column `overtimeHours` on the `Attendance` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."AttendanceApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."OvertimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "public"."Attendance" DROP COLUMN "overtimeHours",
ADD COLUMN     "checkInApprovedAt" TIMESTAMP(3),
ADD COLUMN     "checkInApprovedById" INTEGER,
ADD COLUMN     "checkInRecordedById" INTEGER,
ADD COLUMN     "checkInStatus" "public"."AttendanceApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "checkOutApprovedAt" TIMESTAMP(3),
ADD COLUMN     "checkOutApprovedById" INTEGER,
ADD COLUMN     "checkOutRecordedById" INTEGER,
ADD COLUMN     "checkOutStatus" "public"."AttendanceApprovalStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "public"."OvertimeRequest" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "overtimeDate" TIMESTAMP(3) NOT NULL,
    "durationHours" DECIMAL(8,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "public"."OvertimeStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,

    CONSTRAINT "OvertimeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OvertimeRequest_employeeId_idx" ON "public"."OvertimeRequest"("employeeId");

-- CreateIndex
CREATE INDEX "OvertimeRequest_overtimeDate_idx" ON "public"."OvertimeRequest"("overtimeDate");

-- CreateIndex
CREATE INDEX "OvertimeRequest_status_idx" ON "public"."OvertimeRequest"("status");

-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_checkInRecordedById_fkey" FOREIGN KEY ("checkInRecordedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_checkInApprovedById_fkey" FOREIGN KEY ("checkInApprovedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_checkOutRecordedById_fkey" FOREIGN KEY ("checkOutRecordedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_checkOutApprovedById_fkey" FOREIGN KEY ("checkOutApprovedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
