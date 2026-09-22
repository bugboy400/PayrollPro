CREATE TABLE "CompanyProfile" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "companyName" TEXT NOT NULL,
  "legalName" TEXT,
  "logoUrl" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "pan" TEXT,
  "vat" TEXT,
  "registrationNumber" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'NPR',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Kathmandu',
  "fiscalYear" TEXT NOT NULL DEFAULT 'Baisakh-Chaitra',
  "payslipFooter" TEXT,
  "payslipSignature" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccountLimit" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "maxAdmins" INTEGER NOT NULL DEFAULT 3,
  "maxHr" INTEGER NOT NULL DEFAULT 10,
  "maxPayrollManagers" INTEGER NOT NULL DEFAULT 5,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountLimit_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Permission" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");
CREATE TABLE "RolePermission" (
  "id" SERIAL NOT NULL,
  "role" "Role" NOT NULL,
  "permissionId" INTEGER NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RolePermission_role_permissionId_key" ON "RolePermission"("role","permissionId");
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "UserPermission" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "permissionId" INTEGER NOT NULL,
  "granted" BOOLEAN NOT NULL DEFAULT true,
  "grantedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserPermission_userId_permissionId_key" ON "UserPermission"("userId","permissionId");
CREATE INDEX "UserPermission_userId_idx" ON "UserPermission"("userId");
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "Session" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_revokedAt_expiresAt_idx" ON "Session"("userId","revokedAt","expiresAt");
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "Report" (
  "id" SERIAL NOT NULL,
  "reportCode" TEXT NOT NULL,
  "reporterId" INTEGER NOT NULL,
  "relatedEmployeeId" INTEGER,
  "relatedDepartmentId" INTEGER,
  "assignedToId" INTEGER,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "isConfidential" BOOLEAN NOT NULL DEFAULT false,
  "attachmentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Report_reportCode_key" ON "Report"("reportCode");
CREATE INDEX "Report_reporterId_createdAt_idx" ON "Report"("reporterId","createdAt");
CREATE INDEX "Report_status_priority_idx" ON "Report"("status","priority");
CREATE INDEX "Report_relatedEmployeeId_idx" ON "Report"("relatedEmployeeId");
CREATE INDEX "Report_category_idx" ON "Report"("category");
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_relatedEmployeeId_fkey" FOREIGN KEY ("relatedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_relatedDepartmentId_fkey" FOREIGN KEY ("relatedDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "ReportUpdate" (
  "id" SERIAL NOT NULL,
  "reportId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "status" TEXT,
  "message" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportUpdate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReportUpdate_reportId_createdAt_idx" ON "ReportUpdate"("reportId","createdAt");
ALTER TABLE "ReportUpdate" ADD CONSTRAINT "ReportUpdate_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportUpdate" ADD CONSTRAINT "ReportUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("code","name") VALUES
('EMPLOYEE_VIEW','View employees'),('EMPLOYEE_CREATE','Create employees'),('EMPLOYEE_EDIT','Edit employees'),
('SALARY_VIEW','View salary'),('SALARY_EDIT','Edit salary'),('ATTENDANCE_VIEW','View attendance'),('ATTENDANCE_EDIT','Edit attendance'),
('LEAVE_VIEW','View leave'),('LEAVE_MANAGE','Manage leave'),('LEAVE_APPROVE','Approve leave'),
('PAYROLL_VIEW','View payroll'),('PAYROLL_PROCESS','Process payroll'),('PAYROLL_APPROVE','Approve payroll'),
('PAYSLIP_VIEW','View payslips'),('PAYSLIP_GENERATE','Generate payslips'),
('REPORT_CREATE','Create reports'),('REPORT_VIEW_OWN','View own reports'),('REPORT_VIEW_ASSIGNED','View assigned reports'),('REPORT_VIEW_ALL','View all reports'),('REPORT_ASSIGN','Assign reports'),('REPORT_UPDATE','Update reports'),('REPORT_COMMENT','Comment on reports'),('REPORT_RESOLVE','Resolve reports'),('REPORT_CLOSE','Close reports'),('REPORT_EXPORT','Export reports'),
('USER_VIEW','View users'),('USER_CREATE','Create users'),('USER_EDIT','Edit users'),('USER_DEACTIVATE','Activate/deactivate users'),('PERMISSION_VIEW','View permissions'),('PERMISSION_GRANT','Grant permissions'),('PERMISSION_REVOKE','Revoke permissions'),('AUDIT_VIEW','View audit records'),('COMPANY_SETTINGS_MANAGE','Manage company profile'),('SECURITY_SETTINGS_MANAGE','Manage security settings')
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("role","permissionId") SELECT 'HR',id FROM "Permission" WHERE code IN ('EMPLOYEE_VIEW','EMPLOYEE_CREATE','EMPLOYEE_EDIT','SALARY_VIEW','SALARY_EDIT','ATTENDANCE_VIEW','ATTENDANCE_EDIT','LEAVE_VIEW','LEAVE_MANAGE','LEAVE_APPROVE','PAYSLIP_VIEW','PAYSLIP_GENERATE','REPORT_CREATE','REPORT_VIEW_ASSIGNED','REPORT_VIEW_ALL','REPORT_ASSIGN','REPORT_UPDATE','REPORT_COMMENT','REPORT_RESOLVE','REPORT_CLOSE','REPORT_EXPORT','USER_VIEW','USER_CREATE','USER_DEACTIVATE','AUDIT_VIEW');
INSERT INTO "RolePermission" ("role","permissionId") SELECT 'PAYROLL_MANAGER',id FROM "Permission" WHERE code IN ('EMPLOYEE_VIEW','SALARY_VIEW','SALARY_EDIT','ATTENDANCE_VIEW','LEAVE_VIEW','PAYROLL_VIEW','PAYROLL_PROCESS','PAYROLL_APPROVE','PAYSLIP_VIEW','PAYSLIP_GENERATE','REPORT_CREATE','REPORT_VIEW_ASSIGNED','REPORT_VIEW_ALL','REPORT_COMMENT','REPORT_UPDATE','REPORT_EXPORT');
INSERT INTO "RolePermission" ("role","permissionId") SELECT 'EMPLOYEE',id FROM "Permission" WHERE code IN ('EMPLOYEE_VIEW','ATTENDANCE_VIEW','LEAVE_VIEW','REPORT_CREATE','REPORT_VIEW_OWN','REPORT_COMMENT','PAYSLIP_VIEW','SALARY_VIEW');
INSERT INTO "AccountLimit" ("id","maxAdmins","maxHr","maxPayrollManagers","updatedAt") VALUES (1,3,10,5,CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
