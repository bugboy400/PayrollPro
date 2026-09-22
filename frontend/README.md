# PayrollPro Frontend

React + Vite frontend that consumes the PayrollPro Express/Prisma backend.

## Features implemented

- **Setup wizard** (`/setup`) — first-admin + company profile (matches `POST /api/setup`)
- **Auth** — login, logout, forgot/reset password, JWT + session awareness
- **Role-based navigation** — ADMIN / HR / PAYROLL_MANAGER / EMPLOYEE
- **Dashboard** — role-aware metrics from `GET /api/dashboard`
- **Employees** — searchable directory, detail view, EMPID display
- **Attendance** — date-filtered list with check-in/out status
- **Leave** — request list with status badges
- **Payroll** — process + multi-stage approval actions (HR → Admin → Pay → Lock)
- **Payslips** — period list + PDF download hook
- **Reports & Concerns** — submit + list (`/api/reports/concerns`)
- **Notifications** — list + mark read
- **Profile** — change password
- **Admin** — Users & Accounts, Company Profile, Account Limits, Tax Brackets, Org structure, Audit log
- **Holidays & Performance** — list views

## Run

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173  

Vite proxies `/api` and `/uploads` to `http://localhost:5000`.

## Production build

```bash
npm run build
```

Serve the `dist/` folder (or use the Docker frontend image that points `VITE_API_URL=/api`).

## Notes

- All authorization is enforced by the backend. Frontend only hides UI.
- Employee accounts are **not** created from Users & Accounts (matches backend rules).
- Account limits and permissions follow the backend `AccountLimit` + permission system.
- Expand forms (create employee, leave request, attendance actions) against the exact request bodies in `old_server.js` as needed.
