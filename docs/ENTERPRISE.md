# PayrollPro enterprise platform

## Production initialization

Production does not require or automatically create demo accounts. Start the backend and open the web application. If no user exists, PayrollPro shows the secure setup screen where the first Admin and company profile are created.

The production Docker stack intentionally runs migrations only; it does not execute the development/demo seed.

`backend/prisma/seed.js` creates reference permissions/account-limit configuration only. `backend/prisma/seed.demo.js` is retained solely as an optional development fixture and must never be used for production.

## Account limits

Admin controls the maximum number of active ADMIN, HR and PAYROLL_MANAGER accounts from Administration. Employees have no artificial system-wide limit.

## Identifiers

Employee IDs are generated identifiers and must not be edited through the normal employee form.

## Audit and notifications

Audit records and notifications are separate. Audit records are append-only business/security history and sanitize credential-like fields. Notifications are user-facing alerts.

## Employee reports

Employees can submit reports/concerns about payroll, attendance, leave, workplace issues, other employees, managers, technical problems, policy issues and general concerns. Authorized HR/Admin users can assign and update them.
