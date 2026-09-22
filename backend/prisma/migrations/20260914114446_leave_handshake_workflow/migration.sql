/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `LeaveType` will be added. If there are existing duplicate values, this will fail.
  - The required column `code` was added to the `LeaveType` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- CreateEnum
CREATE TYPE "public"."LeavePaymentPolicy" AS ENUM ('PAID_ONLY', 'UNPAID_ONLY', 'EMPLOYEE_CHOICE', 'HR_DECIDES');

-- CreateEnum
CREATE TYPE "public"."LeaveRevisionAction" AS ENUM ('ORIGINAL', 'PROPOSED', 'ACCEPTED', 'DECLINED');

-- AlterEnum
ALTER TYPE "public"."LeaveStatus" ADD VALUE 'PROPOSED';

-- AlterTable
ALTER TABLE "public"."LeaveRequest" ADD COLUMN     "payment" "public"."LeavePayment" NOT NULL DEFAULT 'PAID',
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "public"."LeaveType" ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "paymentPolicy" "public"."LeavePaymentPolicy" NOT NULL DEFAULT 'EMPLOYEE_CHOICE',
ADD COLUMN     "requiresReason" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "public"."LeaveRequestRevision" (
    "id" SERIAL NOT NULL,
    "leaveRequestId" INTEGER NOT NULL,
    "action" "public"."LeaveRevisionAction" NOT NULL,
    "proposedById" INTEGER NOT NULL,
    "respondedById" INTEGER,
    "leaveTypeId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "payment" "public"."LeavePayment" NOT NULL,
    "reason" TEXT,
    "adjustmentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveRequestRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveRequestRevision_leaveRequestId_idx" ON "public"."LeaveRequestRevision"("leaveRequestId");

-- CreateIndex
CREATE INDEX "LeaveRequestRevision_action_idx" ON "public"."LeaveRequestRevision"("action");

-- CreateIndex
CREATE INDEX "LeaveRequestRevision_proposedById_idx" ON "public"."LeaveRequestRevision"("proposedById");

-- CreateIndex
CREATE INDEX "LeaveRequestRevision_respondedById_idx" ON "public"."LeaveRequestRevision"("respondedById");

-- CreateIndex
CREATE INDEX "LeaveRequest_leaveTypeId_idx" ON "public"."LeaveRequest"("leaveTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_code_key" ON "public"."LeaveType"("code");

-- CreateIndex
CREATE INDEX "LeaveType_isActive_idx" ON "public"."LeaveType"("isActive");

-- AddForeignKey
ALTER TABLE "public"."LeaveRequestRevision" ADD CONSTRAINT "LeaveRequestRevision_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "public"."LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeaveRequestRevision" ADD CONSTRAINT "LeaveRequestRevision_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "public"."LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeaveRequestRevision" ADD CONSTRAINT "LeaveRequestRevision_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeaveRequestRevision" ADD CONSTRAINT "LeaveRequestRevision_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
