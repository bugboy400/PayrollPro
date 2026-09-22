import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePayroll, calculateProgressiveTax } from '../src/services/payroll.js';

test('progressive tax calculator is configurable', () => {
  const brackets = [
    { lowerBound: 0, upperBound: 50000, rate: 0 },
    { lowerBound: 50000, upperBound: 100000, rate: 10 },
    { lowerBound: 100000, upperBound: 200000, rate: 20 }
  ];
  assert.equal(calculateProgressiveTax(75000, brackets), 2500);
  assert.equal(calculateProgressiveTax(150000, brackets), 15000);
});

test('payroll calculator computes gross, statutory deductions and net', () => {
  const result = calculatePayroll({
    salary: { basicSalary: 50000, housingAllowance: 5000, transportAllowance: 2000, otherAllowance: 1000, overtimeRate: 300, employeeSSF: 11, employeePF: 10, employerSSF: 20, employerPF: 10 },
    attendance: [{ overtimeHours: 5 }],
    taxBrackets: [{ lowerBound: 0, upperBound: 1000000, rate: 0 }]
  });
  assert.equal(result.gross, 59500);
  assert.equal(result.employeeSSF, 6545);
  assert.equal(result.employeePF, 5950);
  assert.equal(result.net, 47005);
});

test('payroll calculator applies configurable unpaid leave deduction', () => {
  const result = calculatePayroll({
    salary: { basicSalary: 60000, housingAllowance: 0, transportAllowance: 0, otherAllowance: 0, overtimeRate: 0, employeeSSF: 0, employeePF: 0 },
    workingDays: 20,
    unpaidLeaveDays: 2,
    taxBrackets: [{ lowerBound: 0, upperBound: 1000000, rate: 0 }]
  });
  assert.equal(result.unpaidLeaveDeduction, 6000);
  assert.equal(result.gross, 54000);
  assert.equal(result.net, 54000);
});
