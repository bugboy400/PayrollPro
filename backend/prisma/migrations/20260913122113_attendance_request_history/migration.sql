-- CreateEnum
CREATE TYPE "public"."AttendanceRequestType" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- AlterTable
ALTER TABLE "public"."Attendance" ADD COLUMN     "workedDurationMinutes" INTEGER;

-- CreateTable
CREATE TABLE "public"."AttendanceRequest" (
    "id" SERIAL NOT NULL,
    "attendanceId" INTEGER NOT NULL,
    "type" "public"."AttendanceRequestType" NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "status" "public"."AttendanceApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "recordedById" INTEGER NOT NULL,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceRequest_attendanceId_idx" ON "public"."AttendanceRequest"("attendanceId");

-- CreateIndex
CREATE INDEX "AttendanceRequest_type_idx" ON "public"."AttendanceRequest"("type");

-- CreateIndex
CREATE INDEX "AttendanceRequest_status_idx" ON "public"."AttendanceRequest"("status");

-- CreateIndex
CREATE INDEX "AttendanceRequest_recordedById_idx" ON "public"."AttendanceRequest"("recordedById");

-- CreateIndex
CREATE INDEX "AttendanceRequest_reviewedById_idx" ON "public"."AttendanceRequest"("reviewedById");

-- CreateIndex
CREATE INDEX "AttendanceRequest_createdAt_idx" ON "public"."AttendanceRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "public"."Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
