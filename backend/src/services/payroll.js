function decimal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function round2(value) {
  return Math.round((decimal(value) + Number.EPSILON) * 100) / 100;
}

export function calculateProgressiveTax(taxableIncome, brackets = []) {
  const income = Math.max(0, decimal(taxableIncome));

  if (!income || !Array.isArray(brackets) || brackets.length === 0) {
    return 0;
  }

  const sorted = brackets
    .map((bracket) => ({
      lowerBound: Math.max(0, decimal(bracket.lowerBound)),
      upperBound:
        bracket.upperBound == null
          ? null
          : Math.max(0, decimal(bracket.upperBound)),
      rate: Math.max(0, decimal(bracket.rate)) / 100,
      fixedTax: Math.max(0, decimal(bracket.fixedTax)),
    }))
    .sort((a, b) => a.lowerBound - b.lowerBound);

  let tax = 0;

  for (const bracket of sorted) {
    if (income <= bracket.lowerBound) {
      continue;
    }

    const upper =
      bracket.upperBound == null
        ? income
        : Math.min(income, bracket.upperBound);

    const taxableInBracket = Math.max(
      0,
      upper - bracket.lowerBound,
    );

    tax += taxableInBracket * bracket.rate;

    if (
      bracket.fixedTax > 0 &&
      income > bracket.lowerBound
    ) {
      tax += bracket.fixedTax;
    }

    if (
      bracket.upperBound != null &&
      income <= bracket.upperBound
    ) {
      break;
    }
  }

  return round2(tax);
}

export function calculateStatutoryBase({
  baseType,
  basic = 0,
  allowances = 0,
  gross = 0,
  baseDefinition = null,
}) {
  const basicAmount = Math.max(0, decimal(basic));
  const allowanceAmount = Math.max(0, decimal(allowances));
  const grossAmount = Math.max(0, decimal(gross));

  switch (String(baseType || "").toUpperCase()) {
    case "BASIC":
      return round2(basicAmount);

    case "GROSS":
      return round2(grossAmount);

    case "BASIC_PLUS_ALLOWANCES":
      return round2(
        basicAmount + allowanceAmount,
      );

    case "CUSTOM": {
      if (
        !baseDefinition ||
        typeof baseDefinition !== "object" ||
        Array.isArray(baseDefinition)
      ) {
        throw new Error(
          "CUSTOM statutory base requires a valid baseDefinition",
        );
      }

      const components = {
        BASIC: basicAmount,
        ALLOWANCES: allowanceAmount,
        GROSS: grossAmount,
      };

      let result = 0;

      if (Array.isArray(baseDefinition.components)) {
        for (const rawComponent of baseDefinition.components) {
          const component = String(rawComponent || "").toUpperCase();

          if (!(component in components)) {
            throw new Error(
              `Unsupported statutory base component: ${component}`,
            );
          }

          result += components[component];
        }
      }

      if (Array.isArray(baseDefinition.subtract)) {
        for (const rawComponent of baseDefinition.subtract) {
          const component = String(rawComponent || "").toUpperCase();

          if (!(component in components)) {
            throw new Error(
              `Unsupported statutory base component: ${component}`,
            );
          }

          result -= components[component];
        }
      }

      return round2(Math.max(0, result));
    }

    default:
      throw new Error(
        `Unsupported statutory base type: ${String(baseType)}`,
      );
  }
}

export function calculateContribution({
  base = 0,
  employeeRate = 0,
  employerRate = 0,
}) {
  const contributionBase = Math.max(
    0,
    decimal(base),
  );

  return {
    base: round2(contributionBase),

    employee: round2(
      contributionBase *
        (Math.max(0, decimal(employeeRate)) / 100),
    ),

    employer: round2(
      contributionBase *
        (Math.max(0, decimal(employerRate)) / 100),
    ),
  };
}

function emptyStatutoryResult() {
  return {
    employee: 0,
    employer: 0,
    base: 0,
    ruleVersion: null,
    configId: null,
    enrollmentId: null,
  };
}

export function calculatePayroll({
  salary,
  overtimeRequests = [],
  unpaidLeaveDays = 0,
  workingDays = 0,
  taxBrackets = [],
  statutory = {},
}) {
  if (!salary) {
    throw new Error("Salary structure is required");
  }

  const basic = round2(
    decimal(salary.basicSalary),
  );

  const housingAllowance = round2(
    decimal(salary.housingAllowance),
  );

  const transportAllowance = round2(
    decimal(salary.transportAllowance),
  );

  const otherAllowance = round2(
    decimal(salary.otherAllowance),
  );

  const allowances = round2(
    housingAllowance +
      transportAllowance +
      otherAllowance,
  );

  /*
   * Overtime is intentionally calculated from
   * approved OvertimeRequest records.
   *
   * Attendance does NOT contain overtimeHours.
   */
  const overtimeHours = Array.isArray(overtimeRequests)
    ? overtimeRequests.reduce(
        (total, request) =>
          total + decimal(request.durationHours),
        0,
      )
    : 0;

  const overtimeRate = round2(
    decimal(salary.overtimeRate),
  );

  const overtime = round2(
    overtimeHours * overtimeRate,
  );

  const divisor = decimal(workingDays);

  const unpaidDays = Math.max(
    0,
    decimal(unpaidLeaveDays),
  );

  const unpaidLeaveDeduction =
    divisor > 0
      ? round2(
          (basic / divisor) *
            unpaidDays,
        )
      : 0;

  const gross = round2(
    Math.max(
      0,
      basic +
        allowances +
        overtime -
        unpaidLeaveDeduction,
    ),
  );

  const statutoryResult = {
    ssf: emptyStatutoryResult(),
    epf: emptyStatutoryResult(),
  };

  const rules = Array.isArray(statutory.rules)
    ? statutory.rules
    : [];

  for (const item of rules) {
    if (!item) continue;

    const scheme = String(
      item.scheme || "",
    ).toUpperCase();

    if (scheme !== "SSF" && scheme !== "EPF") {
      continue;
    }

    const enrollmentStatus = String(
      item.enrollmentStatus || "APPLICABLE",
    ).toUpperCase();

    /*
     * No enrollment means the employee is not
     * automatically assumed to be enrolled.
     */
    if (
      enrollmentStatus === "NOT_APPLICABLE" ||
      enrollmentStatus === "EXEMPT" ||
      enrollmentStatus === "SUSPENDED" ||
      enrollmentStatus === "ENDED"
    ) {
      continue;
    }

    if (enrollmentStatus === "PENDING") {
      throw new Error(
        `${scheme} statutory enrollment is pending`,
      );
    }

    if (enrollmentStatus !== "APPLICABLE") {
      continue;
    }

    if (!item.baseType) {
      throw new Error(
        `${scheme} statutory rule has no base type`,
      );
    }

    const base = calculateStatutoryBase({
      baseType: item.baseType,
      basic,
      allowances,
      gross,
      baseDefinition: item.baseDefinition,
    });

    const contribution =
      calculateContribution({
        base,
        employeeRate: item.employeeRate,
        employerRate: item.employerRate,
      });

    statutoryResult[
      scheme.toLowerCase()
    ] = {
      employee: contribution.employee,
      employer: contribution.employer,
      base: contribution.base,

      ruleVersion:
        item.version == null
          ? null
          : Number(item.version),

      configId:
        item.configId == null
          ? null
          : Number(item.configId),

      enrollmentId:
        item.enrollmentId == null
          ? null
          : Number(item.enrollmentId),
    };
  }

  const employeeSSF =
    statutoryResult.ssf.employee;

  const employerSSF =
    statutoryResult.ssf.employer;

  const employeePF =
    statutoryResult.epf.employee;

  const employerPF =
    statutoryResult.epf.employer;

  /*
   * Tax is calculated after employee statutory
   * contributions and before other deductions.
   */
  const taxableIncome = round2(
    Math.max(
      0,
      gross -
        employeeSSF -
        employeePF,
    ),
  );

  const tax = calculateProgressiveTax(
    taxableIncome,
    taxBrackets,
  );

  /*
   * These remain explicit so additional
   * deductions/adjustments can be introduced
   * later without changing the calculation shape.
   */
  const otherDeductions = 0;
  const adjustment = 0;

  const net = round2(
    gross -
      employeeSSF -
      employeePF -
      tax -
      otherDeductions +
      adjustment,
  );

  return {
    basic,

    housingAllowance,
    transportAllowance,
    otherAllowance,

    allowances,

    overtimeHours: round2(
      overtimeHours,
    ),

    overtime,

    unpaidLeaveDeduction,

    gross,

    employeeSSF,
    employerSSF,

    employeePF,
    employerPF,

    taxableIncome,
    tax,

    otherDeductions,
    adjustment,

    net,

    ssfRuleVersion:
      statutoryResult.ssf.ruleVersion,

    epfRuleVersion:
      statutoryResult.epf.ruleVersion,

    ssfBase:
      statutoryResult.ssf.base,

    epfBase:
      statutoryResult.epf.base,

    ssfConfigId:
      statutoryResult.ssf.configId,

    epfConfigId:
      statutoryResult.epf.configId,

    ssfEnrollmentId:
      statutoryResult.ssf.enrollmentId,

    epfEnrollmentId:
      statutoryResult.epf.enrollmentId,
  };
}