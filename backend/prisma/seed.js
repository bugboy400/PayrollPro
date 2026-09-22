import { PrismaClient, Role } from '@prisma/client';
const prisma = new PrismaClient();
const permissions = [
  ['EMPLOYEE_VIEW','View employees'],['EMPLOYEE_CREATE','Create employees'],['EMPLOYEE_EDIT','Edit employees'],['SALARY_VIEW','View salary'],['SALARY_EDIT','Edit salary'],['ATTENDANCE_VIEW','View attendance'],['ATTENDANCE_EDIT','Edit attendance'],['LEAVE_VIEW','View leave'],['LEAVE_MANAGE','Manage leave'],['LEAVE_APPROVE','Approve leave'],['PAYROLL_VIEW','View payroll'],['PAYROLL_PROCESS','Process payroll'],['PAYROLL_APPROVE','Approve payroll'],['PAYSLIP_VIEW','View payslips'],['PAYSLIP_GENERATE','Generate payslips'],['REPORT_CREATE','Create reports'],['REPORT_VIEW_OWN','View own reports'],['REPORT_VIEW_ASSIGNED','View assigned reports'],['REPORT_VIEW_ALL','View all reports'],['REPORT_ASSIGN','Assign reports'],['REPORT_UPDATE','Update reports'],['REPORT_COMMENT','Comment on reports'],['REPORT_RESOLVE','Resolve reports'],['REPORT_CLOSE','Close reports'],['REPORT_EXPORT','Export reports'],['USER_VIEW','View users'],['USER_CREATE','Create users'],['USER_EDIT','Edit users'],['USER_DEACTIVATE','Activate/deactivate users'],['PERMISSION_VIEW','View permissions'],['PERMISSION_GRANT','Grant permissions'],['PERMISSION_REVOKE','Revoke permissions'],['AUDIT_VIEW','View audit records'],['COMPANY_SETTINGS_MANAGE','Manage company profile'],['SECURITY_SETTINGS_MANAGE','Manage security settings']
];
const roleDefaults={
  HR:['EMPLOYEE_VIEW','EMPLOYEE_CREATE','EMPLOYEE_EDIT','SALARY_VIEW','SALARY_EDIT','ATTENDANCE_VIEW','ATTENDANCE_EDIT','LEAVE_VIEW','LEAVE_MANAGE','LEAVE_APPROVE','PAYSLIP_VIEW','PAYSLIP_GENERATE','REPORT_CREATE','REPORT_VIEW_ASSIGNED','REPORT_VIEW_ALL','REPORT_ASSIGN','REPORT_UPDATE','REPORT_COMMENT','REPORT_RESOLVE','REPORT_CLOSE','REPORT_EXPORT','USER_VIEW','USER_CREATE','USER_DEACTIVATE','AUDIT_VIEW'],
  PAYROLL_MANAGER:['EMPLOYEE_VIEW','SALARY_VIEW','SALARY_EDIT','ATTENDANCE_VIEW','LEAVE_VIEW','PAYROLL_VIEW','PAYROLL_PROCESS','PAYROLL_APPROVE','PAYSLIP_VIEW','PAYSLIP_GENERATE','REPORT_CREATE','REPORT_VIEW_ASSIGNED','REPORT_VIEW_ALL','REPORT_COMMENT','REPORT_UPDATE','REPORT_EXPORT'],
  EMPLOYEE:['EMPLOYEE_VIEW','ATTENDANCE_VIEW','LEAVE_VIEW','REPORT_CREATE','REPORT_VIEW_OWN','REPORT_COMMENT','PAYSLIP_VIEW','SALARY_VIEW']
};
async function main(){
 for(const [code,name] of permissions) await prisma.permission.upsert({where:{code},update:{name},create:{code,name}});
 for(const [role,codes] of Object.entries(roleDefaults)) for(const code of codes){const p=await prisma.permission.findUnique({where:{code}});await prisma.rolePermission.upsert({where:{role_permissionId:{role:Role[role],permissionId:p.id}},update:{},create:{role:Role[role],permissionId:p.id}});}
 await prisma.accountLimit.upsert({where:{id:1},update:{},create:{id:1,maxAdmins:3,maxHr:10,maxPayrollManagers:5}});
 console.log('PayrollPro reference data initialized. No users or employees were created.');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
