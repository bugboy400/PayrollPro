-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'HR', 'PAYROLL_MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "public"."EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "public"."LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."PayrollStatus" AS ENUM ('DRAFT', 'PROCESSING', 'PROCESSED', 'APPROVED', 'PAID', 'LOCKED');

-- CreateEnum
CREATE TYPE "public"."LeavePayment" AS ENUM ('PAID', 'UNPAID');

-- CreateEnum
CREATE TYPE "public"."AccrualType" AS ENUM ('ANNUAL', 'MONTHLY', 'NONE');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "employeeId" INTEGER,
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Employee" (
    "id" SERIAL NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "gender" TEXT,
    "maritalStatus" TEXT,
    "joiningDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "status" "public"."EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "branchId" INTEGER,
    "departmentId" INTEGER,
    "designationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Branch" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Department" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Designation" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "Designation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Attendance" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "overtimeHours" DECIMAL(8,2) NOT NULL DEFAULT 0,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeaveType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "payment" "public"."LeavePayment" NOT NULL DEFAULT 'PAID',
    "accrualType" "public"."AccrualType" NOT NULL DEFAULT 'ANNUAL',
    "annualEntitlement" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "carryForward" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeaveBalance" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "leaveTypeId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "opening" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "accrued" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "used" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(8,2) NOT NULL DEFAULT 0,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeaveRequest" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "leaveTypeId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "reason" TEXT,
    "status" "public"."LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Holiday" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "holidayDate" TIMESTAMP(3) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SalaryStructure" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "basicSalary" DECIMAL(14,2) NOT NULL,
    "housingAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "overtimeRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employeeSSF" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employerSSF" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employeePF" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employerPF" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StatutoryConfig" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "employeeRate" DECIMAL(8,5) NOT NULL DEFAULT 0,
    "employerRate" DECIMAL(8,5) NOT NULL DEFAULT 0,
    "base" TEXT NOT NULL DEFAULT 'BASIC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatutoryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayrollPeriod" (
    "id" SERIAL NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "public"."PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "processedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaxBracket" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "lowerBound" DECIMAL(14,2) NOT NULL,
    "upperBound" DECIMAL(14,2),
    "rate" DECIMAL(8,5) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaxBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayrollItem" (
    "id" SERIAL NOT NULL,
    "payrollPeriodId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "basicSalary" DECIMAL(14,2) NOT NULL,
    "grossEarnings" DECIMAL(14,2) NOT NULL,
    "unpaidLeaveDays" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "unpaidLeaveDeduct" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "overtimeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employeeSSF" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employerSSF" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employeePF" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employerPF" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PayrollItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "public"."User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "public"."Employee"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "public"."Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "public"."Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_branchId_idx" ON "public"."Employee"("branchId");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "public"."Employee"("status");

-- CreateIndex
CREATE INDEX "Employee_employeeCode_idx" ON "public"."Employee"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_key" ON "public"."Branch"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "public"."Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Designation_title_key" ON "public"."Designation"("title");

-- CreateIndex
CREATE INDEX "Attendance_workDate_idx" ON "public"."Attendance"("workDate");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_employeeId_workDate_key" ON "public"."Attendance"("employeeId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_name_key" ON "public"."LeaveType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_leaveTypeId_year_key" ON "public"."LeaveBalance"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_startDate_endDate_idx" ON "public"."LeaveRequest"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_holidayDate_key" ON "public"."Holiday"("holidayDate");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryStructure_employeeId_key" ON "public"."SalaryStructure"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "StatutoryConfig_name_key" ON "public"."StatutoryConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_month_year_key" ON "public"."PayrollPeriod"("month", "year");

-- CreateIndex
CREATE INDEX "TaxBracket_fiscalYear_idx" ON "public"."TaxBracket"("fiscalYear");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "public"."AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "PayrollItem_employeeId_idx" ON "public"."PayrollItem"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollItem_payrollPeriodId_employeeId_key" ON "public"."PayrollItem"("payrollPeriodId", "employeeId");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Employee" ADD CONSTRAINT "Employee_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "public"."Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeaveBalance" ADD CONSTRAINT "LeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "public"."LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "public"."LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryStructure" ADD CONSTRAINT "SalaryStructure_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollItem" ADD CONSTRAINT "PayrollItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollItem" ADD CONSTRAINT "PayrollItem_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "public"."PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

