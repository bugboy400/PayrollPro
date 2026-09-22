# PayrollPro

Production-oriented payroll and workforce management platform.

## Architecture

- React web client
- Flutter mobile client (`mobile/`)
- One Node.js + Express API
- One PostgreSQL database
- Prisma ORM
- Shared authentication, authorization, payroll, notifications, audit, reports and business rules

## Production setup

1. Copy `backend/.env.example` to `backend/.env` and set PostgreSQL/JWT values.
2. Install backend dependencies.
3. Run `npx prisma generate`.
4. Run `npx prisma migrate deploy`.
5. Run `npm run seed` to ensure permission/reference configuration (it creates no users or employees).
6. Start the API.
7. Start the React client and complete the `/setup` initialization screen.
8. Configure SMTP in production so account activation and password recovery emails are delivered.

The Docker stack runs migrations but intentionally does not seed demo accounts.

## Development demo fixture

`backend/prisma/seed.demo.js` is retained only as an optional development fixture. Never run it against a production database.

## Mobile

From `mobile/`:

```bash
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:5000/api
```

For a physical device use the LAN address of the machine running the backend.

## Security

- No plaintext passwords
- Reset/activation tokens are stored hashed
- Session revocation supported
- Role limits enforced server-side
- Employee IDs are immutable in normal editing
- Audit events exclude credential-like secrets
- Audit and notifications are separate systems
- Production has no hard-coded demo accounts or artificial employee limit
