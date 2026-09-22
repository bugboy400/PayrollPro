# PayrollPro Architecture

## 3-tier architecture

### Presentation tier
React/Vite is responsible for:

- navigation
- role-aware UI
- forms
- tables
- dashboards
- employee self-service
- API calls through Axios

It never connects directly to PostgreSQL.

### Application tier
Express is responsible for:

- authentication
- authorization
- validation
- business rules
- payroll calculation
- leave approval
- performance scoring
- audit logging
- API responses

### Data tier
PostgreSQL stores durable relational data. Prisma provides type-safe database access.

## Security model

The UI hides actions that a role should not use, but that is only a usability feature. The backend independently checks roles for every protected operation.

Passwords are hashed using bcrypt. JWTs contain identity/role information and are validated on each protected request. Sensitive actions are audited.

## Separation of duties

Payroll is deliberately separated:

1. Payroll Manager prepares calculation.
2. HR reviews/approves.
3. Admin independently approves.
4. Payroll Manager records payment/locks period.

This prevents the person who prepares payroll from being the final approver.

## Scalability choices

- Server-side employee pagination
- Search at database level
- Indexes on frequent filters
- Limited result windows for history tables
- Relational constraints for uniqueness
- Transactional leave approval and payroll generation

For large production deployments, payroll generation should be moved to a queue/background worker and reports should use optimized read models or reporting queries.

## Performance model

A performance cycle contains employee goals. Each goal can have weighted KPIs. Reviews contain self and manager ratings plus a final score and grade.

The intended calculation is:

`Final Score = sum(KPI Score × KPI Weight)`

with weights normalized to the organization's policy.

## Future production integrations

- SSO/identity provider
- Object storage
- Email/SMS notifications
- Bank payment file/API
- biometric attendance integration
- background job queue
- tax/statutory rule engine
- centralized observability
