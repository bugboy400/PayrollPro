# PayrollPro

**Enterprise payroll and workforce management platform**

PayrollPro is a full-stack HR and payroll system designed for real organizational use: multi-role access, attendance with approval workflow, leave management, salary structures, payroll processing, payslips, and administration — backed by a single Node.js API and PostgreSQL database.

---

## Architecture

```
React (Vite) Web App          Flutter Mobile (planned / shared API)
         │                              │
         └──────────── HTTPS ───────────┘
                        │
                 Node.js + Express
                        │
                   Prisma ORM
                        │
                    PostgreSQL
```

- **One backend** — all business logic, auth, and permissions live on the API  
- **One database** — no artificial employee limits in application design  
- **API-first** — web and mobile consume the same REST endpoints  

---

## Tech stack

| Layer | Technology |
|--------|------------|
| Frontend | React 18, Vite, React Router, Tailwind CSS, Axios |
| Backend | Node.js, Express |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth | JWT sessions, role-based access (ADMIN, HR, PAYROLL_MANAGER, EMPLOYEE) |
| PDF | PDFKit (payslip generation) |

---

## Roles

| Role | Typical access |
|------|----------------|
| **ADMIN** | Full system: org setup, users, permissions, payroll approval, audit, reports |
| **HR** | Employees, attendance approval, leave, holidays, reports |
| **PAYROLL_MANAGER** | Salary, payroll processing, payslips (scoped by permissions) |
| **EMPLOYEE** | Own attendance, leave, payslips, profile, concerns |

Granular **user permissions** can extend access beyond the base role (backend-enforced).

---

## Features implemented

### Core platform
- [x] System setup / first admin bootstrap  
- [x] Email-based auth, login, password flows  
- [x] Role-based dashboards and navigation  
- [x] Company profile, account limits, organization (branches, departments, designations)  
- [x] User management and permission grants  
- [x] Audit logging  
- [x] Notifications (API-backed)  

### Workforce
- [x] Employee CRUD and profiles  
- [x] **Attendance** — check-in / check-out with HR/Admin approval  
- [x] `AttendanceRequest` history (approve / reject by request id)  
- [x] Overtime requests  
- [x] **Leave** — types configuration, requests, approve/reject, balances  
- [x] Holidays  

### Payroll
- [x] Salary structures  
- [x] Payroll periods and processing  
- [x] Statutory fields (SSF / PF on records)  
- [x] Payslips (web preview + print; API PDF endpoint)  
- [x] Tax brackets (admin)  

### Reporting
- [x] Reports & analytics (admin-oriented)  
- [x] Reports & concerns (employee / assignee workflow)  

### UI / UX
- [x] Responsive layout (sidebar + top bar)  
- [x] Profile menu (personal details, settings, logout)  
- [x] Elegant payslip print layout  

---

## Project structure

```
PayrollPro/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.js
│   ├── src/
│   │   ├── server.js          # main API
│   │   └── ...
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── contexts/
│   │   ├── layouts/
│   │   ├── pages/
│   │   └── ...
│   ├── package.json
│   └── .env.example
├── docs/
├── setup.ps1
└── README.md
```

---

## Getting started

### Prerequisites

- Node.js 18+  
- PostgreSQL 14+  
- npm  

### 1. Database

Create a database and set `DATABASE_URL` in `backend/.env` (see `backend/.env.example`).

### 2. Backend

```bash
cd backend
cp .env.example .env   # Windows: copy .env.example .env
npm install
npx prisma migrate deploy   # or: npx prisma migrate dev
npx prisma generate
npm start                   # or: node src/server.js
```

API default: `http://localhost:5000`

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

App default: `http://localhost:5173`  
Vite proxies `/api` to the backend.

### 4. First-time setup

1. Open the web app  
2. Complete **setup** (company + first admin) if the system is uninitialized  
3. Log in as ADMIN  
4. Create org structure → HR / payroll users → employees  
5. Configure **leave types** under Leave → Leave types  

---

## Attendance workflow

1. Employee **checks in** → `Attendance` + `AttendanceRequest` (PENDING)  
2. HR/Admin **approves** via `POST /api/attendance/requests/:requestId/approve`  
3. Employee **checks out** → new request (PENDING)  
4. HR/Admin **approves** checkout → day COMPLETE (worked duration when both approved)  

**Note:** `checkInStatus` / `checkOutStatus` are optional in the schema so a day is not marked “pending checkout” before a checkout exists.

---

## Leave workflow

1. Admin/HR creates **leave types** (name, annual entitlement, payment policy, etc.)  
2. Employee submits a **leave request**  
3. HR/Admin **approves** or **rejects**  
4. On approve, **leave balance** is updated (`opening` / `used`)  

---

## Environment

Never commit real secrets. Use:

- `backend/.env` — `DATABASE_URL`, JWT secret, mail settings, etc.  
- `frontend/.env` — API base URL if not using the Vite proxy  

Templates: `*.env.example`

---

## Scripts (backend)

| Command | Purpose |
|---------|---------|
| `npm start` | Run API |
| `npx prisma studio` | Browse data |
| `npx prisma migrate dev` | Apply migrations in development |
| `npx prisma generate` | Regenerate Prisma Client |

---

## Documentation

See `/docs` for additional notes:

- `ARCHITECTURE.md`  
- `API.md`  
- `DATABASE.md`  
- `SETUP.md`  
- `ENTERPRISE.md`  

---

## Repository

**GitHub:** [https://github.com/bugboy400/PayrollPro](https://github.com/bugboy400/PayrollPro)

---

## Status (project progress)

| Area | Status |
|------|--------|
| Auth & roles | Working |
| Employees & org | Working |
| Attendance check-in/out + approvals | Working (schema + request flow aligned) |
| Leave types + requests | Working (API fields match Prisma) |
| Salary / payroll / payslips | Working |
| Admin permissions UI | Present (backend role gates still apply where coded) |
| Flutter mobile | Shared API ready; app not required for web delivery |
| Production hardening | Ongoing (env, HTTPS, backups, rate limits as needed for deployment) |

---

## License

Private / academic project unless otherwise stated by the repository owner.

---

*PayrollPro — built as a production-oriented final-year system, not a demo CRUD app.*
