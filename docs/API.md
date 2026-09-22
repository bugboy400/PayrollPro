# PayrollPro API

Base path: `/api`

## Authentication
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/change-password`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

JWTs are short-lived bearer tokens. Passwords are bcrypt hashes only. Reset tokens are stored as SHA-256 hashes, expire after 15 minutes and are single-use.

## Organization / employees
- `GET /employees?page=&limit=&q=`
- `GET /employees/:id`
- `POST /employees` — ADMIN/HR
- `PATCH /employees/:id` — ADMIN/HR
- `POST /employees/:id/photo`
- `GET /org/departments`
- `GET /org/designations?departmentId=`
- `GET /org/branches`

Employee directory search and pagination are server-side.

## Attendance
- `GET /attendance`
- `POST /attendance` — HR/ADMIN review/update
- `POST /attendance/check-in` — EMPLOYEE, server timestamp
- `POST /attendance/check-out` — EMPLOYEE, server timestamp

## Leave / holidays
- `GET /leave-types`
- `POST /leave-types` — HR
- `GET /leaves`
- `POST /leaves`
- `PATCH /leaves/:id` — HR
- `GET /leave-balances/me`
- `GET /holidays`
- `POST /holidays` — HR/ADMIN
- `PATCH /holidays/:id` — HR/ADMIN
- `DELETE /holidays/:id` — ADMIN

## Salary / payroll
- `GET /salary`
- `PUT /salary/:employeeId` — HR/PAYROLL_MANAGER
- `GET /payroll`
- `POST /payroll/process` — PAYROLL_MANAGER
- `POST /payroll/:id/hr-approve` — HR
- `POST /payroll/:id/admin-approve` — ADMIN
- `POST /payroll/:id/pay` — PAYROLL_MANAGER
- `POST /payroll/:id/lock` — PAYROLL_MANAGER
- `GET /payslips/:id`
- `GET /payslips/:id/pdf`
- `GET /reports/payroll.csv`
- `GET /tax-brackets`
- `POST /tax-brackets` — ADMIN
- `PATCH /tax-brackets/:id` — ADMIN

Payroll is calculated on the backend from the active salary, approved attendance, approved leave, holidays and active tax configuration. Unpaid leave is deducted from basic salary using the calculated working-day divisor.

## Performance
- `GET /performance/cycles`
- `POST /performance/cycles` — HR
- `POST /performance/goals` — HR
- `GET /performance/me`
- `POST /performance/reviews`
- `PATCH /performance/reviews/:id` — HR

## Users / governance
- `GET /users` — ADMIN/HR
- `POST /users` — ADMIN/HR, with HR restricted to EMPLOYEE accounts
- `PATCH /users/:id/status` — ADMIN/HR according to role scope
- `POST /users/:id/force-password-reset` — ADMIN
- `GET /notifications`
- `PATCH /notifications/:id/read`
- `GET /security/history`
- `GET /settings`
- `PATCH /settings` — `system`, `light`, `dark`
- `GET /audit` — ADMIN full scope, HR/Payroll Manager role scope

## Operational requirements
All protected endpoints enforce authorization server-side. Production errors are sanitized, rate limiting and Helmet are enabled, and graceful shutdown disconnects Prisma.
