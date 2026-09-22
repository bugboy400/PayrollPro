
import {
  PrismaClient,
  Role,
  EmploymentStatus,
  LeavePayment,
  AccrualType,
  PerformanceStatus
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'Password123!';
const DEMO_EMPLOYEE_COUNT = 104;

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const year = new Date().getFullYear();

  // ============================================================
  // 1. ORGANIZATION
  // ============================================================

  const branch = await prisma.branch.upsert({
    where: { name: 'Head Office' },
    update: {},
    create: {
      name: 'Head Office',
      address: 'Kathmandu, Nepal'
    }
  });

  const depNames = [
    'Information Technology',
    'Human Resources',
    'Finance',
    'Operations',
    'Sales'
  ];

  const deps = [];

  for (const name of depNames) {
    deps.push(
      await prisma.department.upsert({
        where: { name },
        update: {},
        create: { name }
      })
    );
  }

  const desNames = [
    'Software Engineer',
    'HR Officer',
    'Accountant',
    'Operations Officer',
    'Sales Executive',
    'Manager'
  ];

  const des = [];
  const desMap = [0, 1, 2, 3, 4, 0];

  for (let i = 0; i < desNames.length; i++) {
    des.push(
      await prisma.designation.upsert({
        where: { title: desNames[i] },
        update: {
          departmentId: deps[desMap[i]].id
        },
        create: {
          title: desNames[i],
          departmentId: deps[desMap[i]].id
        }
      })
    );
  }

  // ============================================================
  // 2. LEAVE TYPES
  // ============================================================

  const types = [
    ['Annual Leave', LeavePayment.PAID, AccrualType.ANNUAL, 18],
    ['Sick Leave', LeavePayment.PAID, AccrualType.ANNUAL, 12],
    ['Marriage Leave', LeavePayment.PAID, AccrualType.NONE, 5],
    ['Maternity Leave', LeavePayment.PAID, AccrualType.NONE, 90],
    ['Paternity Leave', LeavePayment.PAID, AccrualType.NONE, 15],
    ['Unpaid Leave', LeavePayment.UNPAID, AccrualType.NONE, 0]
  ];

  const leaveTypes = [];

  for (const [
    name,
    payment,
    accrualType,
    annualEntitlement
  ] of types) {
    leaveTypes.push(
      await prisma.leaveType.upsert({
        where: { name },
        update: {
          payment,
          accrualType,
          annualEntitlement
        },
        create: {
          name,
          payment,
          accrualType,
          annualEntitlement
        }
      })
    );
  }

  const annual = leaveTypes.find(
    (leaveType) => leaveType.name === 'Annual Leave'
  );

  // ============================================================
  // 3. STATUTORY CONFIGURATION
  // ============================================================

  await prisma.statutoryConfig.upsert({
    where: { name: 'SSF' },
    update: {
      employeeRate: 11,
      employerRate: 20
    },
    create: {
      name: 'SSF',
      effectiveFrom: new Date(`${year}-01-01`),
      employeeRate: 11,
      employerRate: 20,
      base: 'BASIC'
    }
  });

  await prisma.statutoryConfig.upsert({
    where: { name: 'PF' },
    update: {
      employeeRate: 10,
      employerRate: 10
    },
    create: {
      name: 'PF',
      effectiveFrom: new Date(`${year}-01-01`),
      employeeRate: 10,
      employerRate: 10,
      base: 'BASIC'
    }
  });

  // ============================================================
  // 4. DEMO TAX CONFIGURATION
  // ============================================================
  // Deliberately labelled demo configuration.
  // Replace with verified legal rules before real payroll use.

  const demoBrackets = [
    ['Demo: 0-50k', 0, 50000, 0],
    ['Demo: 50k-100k', 50000, 100000, 10],
    ['Demo: 100k-200k', 100000, 200000, 20],
    ['Demo: 200k+', 200000, null, 30]
  ];

  for (const [
    label,
    lowerBound,
    upperBound,
    rate
  ] of demoBrackets) {
    const existing = await prisma.taxBracket.findFirst({
      where: {
        label,
        effectiveFrom: new Date(`${year}-01-01`)
      }
    });

    if (!existing) {
      await prisma.taxBracket.create({
        data: {
          label,
          lowerBound,
          upperBound,
          rate,
          fixedTax: 0,
          effectiveFrom: new Date(`${year}-01-01`),
          isActive: true
        }
      });
    }
  }

  // ============================================================
  // 5. DEMO MANAGEMENT LOGIN ACCOUNTS
  // ============================================================

  const accounts = [
    ['admin@payrollpro.local', Role.ADMIN],
    ['hr@payrollpro.local', Role.HR],
    ['payroll@payrollpro.local', Role.PAYROLL_MANAGER]
  ];

  let admin;

  for (const [email, role] of accounts) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        role,
        isActive: true,
        mustChangePassword: false
      },
      create: {
        email,
        passwordHash,
        role,
        mustChangePassword: false
      }
    });

    if (role === Role.ADMIN) {
      admin = user;
    }
  }

  // ============================================================
  // 6. DEMO EMPLOYEES
  // ============================================================
  //
  // IMPORTANT:
  // Only 104 employee records are created.
  //
  // These are demonstration records only.
  // The production application is intended to support
  // thousands of real employees without seeding them here.
  //
  // Employee 1 is used by the primary employee demo account.
  // Employees 2-101 receive additional employee demo accounts.
  // Employees 102-104 remain demo employee records without login.
  // ============================================================

  for (let i = 1; i <= DEMO_EMPLOYEE_COUNT; i++) {
    const employeeCode = `EMP${String(i).padStart(4, '0')}`;
    const email = `employee${i}@payrollpro.local`;

    const employee = await prisma.employee.upsert({
      where: { employeeCode },
      update: {
        email,
        status: EmploymentStatus.ACTIVE,
        branchId: branch.id,
        departmentId: deps[i % deps.length].id,
        designationId: des[i % des.length].id
      },
      create: {
        employeeCode,
        firstName: `Employee${i}`,
        lastName: 'Demo',
        email,
        joiningDate: new Date(2023, i % 12, 1),
        status: EmploymentStatus.ACTIVE,
        branchId: branch.id,
        departmentId: deps[i % deps.length].id,
        designationId: des[i % des.length].id
      }
    });

    // Salary structure for demo employee
    await prisma.salaryStructure.upsert({
      where: {
        employeeId: employee.id
      },
      update: {},
      create: {
        employeeId: employee.id,
        basicSalary: 30000 + (i % 20) * 2500,
        housingAllowance: 5000,
        transportAllowance: 2500,
        otherAllowance: 1500,
        overtimeRate: 300,
        employeeSSF: 11,
        employerSSF: 20,
        employeePF: 10,
        employerPF: 10
      }
    });

    // Annual leave balance for demo employee
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: employee.id,
          leaveTypeId: annual.id,
          year
        }
      },
      update: {},
      create: {
        employeeId: employee.id,
        leaveTypeId: annual.id,
        year,
        opening: 18,
        accrued: 18,
        used: 0
      }
    });
  }

  // ============================================================
  // 7. PRIMARY EMPLOYEE DEMO ACCOUNT
  // ============================================================

  const demo = await prisma.employee.findUnique({
    where: {
      employeeCode: 'EMP0001'
    }
  });

  if (!demo) {
    throw new Error('EMP0001 was not created.');
  }

  await prisma.user.upsert({
    where: {
      email: 'employee@payrollpro.local'
    },
    update: {
      passwordHash,
      role: Role.EMPLOYEE,
      employeeId: demo.id,
      isActive: true,
      mustChangePassword: false
    },
    create: {
      email: 'employee@payrollpro.local',
      passwordHash,
      role: Role.EMPLOYEE,
      employeeId: demo.id,
      mustChangePassword: false
    }
  });

  // ============================================================
  // 8. ADDITIONAL EMPLOYEE DEMO LOGIN ACCOUNTS
  // ============================================================
  //
  // employee@payrollpro.local = employee #1
  // employee2..employee101      = employees #2..#101
  //
  // Therefore:
  // 101 employee login accounts
  // + 3 management login accounts
  // = EXACTLY 104 login accounts
  // ============================================================

  for (let i = 2; i <= 101; i++) {
    const employee = await prisma.employee.findUnique({
      where: {
        employeeCode: `EMP${String(i).padStart(4, '0')}`
      }
    });

    if (!employee) {
      throw new Error(
        `Demo employee EMP${String(i).padStart(4, '0')} was not found.`
      );
    }

    await prisma.user.upsert({
      where: {
        email: `employee${i}@payrollpro.local`
      },
      update: {
        passwordHash,
        role: Role.EMPLOYEE,
        employeeId: employee.id,
        isActive: true,
        mustChangePassword: false
      },
      create: {
        email: `employee${i}@payrollpro.local`,
        passwordHash,
        role: Role.EMPLOYEE,
        employeeId: employee.id,
        mustChangePassword: false
      }
    });
  }

  // ============================================================
  // 9. HOLIDAYS
  // ============================================================

  const holidays = [
    ['New Year', `${year}-01-01`],
    ['Labour Day', `${year}-05-01`],
    ['Constitution Day', `${year}-09-20`],
    ['Christmas', `${year}-12-25`]
  ];

  for (const [name, date] of holidays) {
    await prisma.holiday.upsert({
      where: {
        holidayDate: new Date(date)
      },
      update: {
        name,
        isPaid: true
      },
      create: {
        name,
        holidayDate: new Date(date),
        isPaid: true
      }
    });
  }

  // ============================================================
  // 10. PERFORMANCE CYCLE
  // ============================================================

  const cycle = await prisma.performanceCycle.upsert({
    where: {
      name_year: {
        name: `Annual Performance ${year}`,
        year
      }
    },
    update: {
      status: PerformanceStatus.OPEN
    },
    create: {
      name: `Annual Performance ${year}`,
      year,
      startDate: new Date(`${year}-01-01`),
      endDate: new Date(`${year}-12-31`),
      status: PerformanceStatus.OPEN
    }
  });

  // Demo performance goal for EMP0001
  if (demo) {
    let goal = await prisma.performanceGoal.findFirst({
      where: {
        cycleId: cycle.id,
        employeeId: demo.id,
        title: 'Annual delivery goals'
      }
    });

    if (!goal) {
      goal = await prisma.performanceGoal.create({
        data: {
          cycleId: cycle.id,
          employeeId: demo.id,
          title: 'Annual delivery goals',
          description:
            'Demonstration performance goal for the FYP presentation.',
          weight: 100,
          target: 100,
          actual: 90
        }
      });
    }

    const existingKpi = await prisma.employeeKPI.findFirst({
      where: {
        goalId: goal.id,
        name: 'Goal achievement'
      }
    });

    if (!existingKpi) {
      await prisma.employeeKPI.create({
        data: {
          goalId: goal.id,
          employeeId: demo.id,
          name: 'Goal achievement',
          weight: 100,
          score: 90
        }
      });
    }
  }

  // ============================================================
  // 11. AUDIT LOG
  // ============================================================

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'SEED',
      entity: 'SYSTEM',
      metadata: {
        demoEmployees: DEMO_EMPLOYEE_COUNT,
        demoLoginAccounts: 104,
        year
      }
    }
  });

  // ============================================================
  // 12. COMPLETION MESSAGE
  // ============================================================

  console.log(
    `PayrollPro seed complete: ${DEMO_EMPLOYEE_COUNT} demo employees, exactly 104 demo login accounts, configuration and ${year} performance cycle.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });