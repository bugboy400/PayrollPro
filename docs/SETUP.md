# PayrollPro setup

## Requirements
- Node.js 22+
- npm 10+
- PostgreSQL 17+ (or Docker)

## Local development

1. Create `backend/.env` from `backend/.env.example` and set `DATABASE_URL` and a strong `JWT_SECRET`.
2. Create `frontend/.env` from `frontend/.env.example` if you are not using the default API URL.
3. Install backend dependencies and generate Prisma Client:

```powershell
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run seed
npm test
npm run dev
```

4. In another terminal:

```powershell
cd frontend
npm install
npm run build
npm run dev
```

Open `http://localhost:5173`.

## Demo accounts
All 104 demo login accounts use `Password123!`.

- `admin@payrollpro.local`
- `hr@payrollpro.local`
- `payroll@payrollpro.local`
- `employee@payrollpro.local`
- `employee2@payrollpro.local` through `employee101@payrollpro.local`

These accounts are demonstration data only and are not an employee capacity limit.

## Production
Use committed migrations with:

```powershell
npx prisma migrate deploy
npx prisma generate
npm start
```

Never commit production secrets. Supply `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL` and other environment-specific values through the deployment environment.

## Docker

```powershell
docker compose up --build
```

Frontend: `http://localhost:8080`  
API health: `http://localhost:5000/api/health`

The backend container applies migrations and runs the idempotent seed before starting. Replace the default compose password and JWT secret for real deployment.
