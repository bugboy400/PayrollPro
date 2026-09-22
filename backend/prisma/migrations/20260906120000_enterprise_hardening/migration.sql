-- Enterprise hardening: account security, notifications, theme preferences,
-- designation/department dependency, holiday types and unpaid-leave payroll deduction.
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3);
ALTER TABLE "public"."PayrollRecord" ADD COLUMN IF NOT EXISTS "unpaidLeaveDeduction" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "public"."Designation" ADD COLUMN IF NOT EXISTS "departmentId" INTEGER;
CREATE INDEX IF NOT EXISTS "Designation_departmentId_idx" ON "public"."Designation"("departmentId");
DO $$ BEGIN
  CREATE TYPE "public"."HolidayType" AS ENUM ('PUBLIC','COMPANY','OPTIONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "public"."Holiday" ADD COLUMN IF NOT EXISTS "type" "public"."HolidayType" NOT NULL DEFAULT 'PUBLIC';

CREATE TABLE IF NOT EXISTS "public"."Notification" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'INFO',
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_createdAt_idx" ON "public"."Notification"("userId","isRead","createdAt");

CREATE TABLE IF NOT EXISTS "public"."SecurityEvent" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SecurityEvent_userId_createdAt_idx" ON "public"."SecurityEvent"("userId","createdAt");
CREATE INDEX IF NOT EXISTS "SecurityEvent_action_createdAt_idx" ON "public"."SecurityEvent"("action","createdAt");

CREATE TABLE IF NOT EXISTS "public"."PasswordResetToken" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_expiresAt_idx" ON "public"."PasswordResetToken"("userId","expiresAt");

CREATE TABLE IF NOT EXISTS "public"."UserPreference" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL UNIQUE,
  "theme" TEXT NOT NULL DEFAULT 'system',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

BEGIN;
CREATE TYPE "public"."AttendanceStatus_new" AS ENUM ('PRESENT','ABSENT','LATE','HALF_DAY','LEAVE','HOLIDAY','DAY_OFF');
ALTER TABLE "public"."Attendance" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."Attendance" ALTER COLUMN "status" TYPE "public"."AttendanceStatus_new" USING "status"::text::"public"."AttendanceStatus_new";
ALTER TYPE "public"."AttendanceStatus" RENAME TO "AttendanceStatus_old";
ALTER TYPE "public"."AttendanceStatus_new" RENAME TO "AttendanceStatus";
DROP TYPE "public"."AttendanceStatus_old";
ALTER TABLE "public"."Attendance" ALTER COLUMN "status" SET DEFAULT 'PRESENT';
COMMIT;
