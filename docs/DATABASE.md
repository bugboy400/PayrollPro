# PayrollPro Database Design

## Core entities

### User
Authentication identity, role and optional employee link.

### Employee
Personal and employment master record, including profile photo URL and organizational relationships.

### Attendance
Daily employee attendance and overtime.

### LeaveType / LeaveBalance / LeaveRequest
Leave policy, annual balance and individual requests.

### SalaryStructure / SalaryChange
Current compensation and salary history.

### PayrollPeriod / PayrollRecord / Payslip
Monthly payroll batch, per-employee calculation and payslip record.

### PerformanceCycle / PerformanceGoal / EmployeeKPI / PerformanceReview
Performance management hierarchy.

### ApprovalRequest
Generic foundation for workflows that require independent review.

### AuditLog
Immutable-style application activity record. Passwords are never placed in audit metadata.

## Relationships

```text
User ───── optional ───── Employee
Employee ── Department
Employee ── Designation
Employee ── Branch
Employee ── Attendance
Employee ── LeaveRequest ── LeaveType
Employee ── LeaveBalance ── LeaveType
Employee ── SalaryStructure
Employee ── SalaryChange
Employee ── PayrollRecord ── PayrollPeriod
PayrollRecord ── Payslip
PerformanceCycle ── PerformanceGoal ── EmployeeKPI
PerformanceCycle ── PerformanceReview ── Employee
User ── AuditLog
User ── ApprovalRequest
```

## Important constraints

- Employee code unique
- Employee email unique
- User email unique
- One salary structure per employee
- One attendance record per employee/day
- One leave balance per employee/type/year
- One payroll record per employee/payroll period
- One performance review per employee/cycle
- One payroll period per year/month

## Indexing

High-volume paths have indexes for employee status, department, branch, attendance dates, employee/date, employee/status leave queries and payroll employee relationships.
