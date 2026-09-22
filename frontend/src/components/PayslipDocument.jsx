function money(v) {
  const n = Number(v || 0);
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${abs})` : abs;
}

function periodLabel(year, month) {
  if (!year || !month) return '—';
  try {
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return `${year}-${String(month).padStart(2, '0')}`;
  }
}

export default function PayslipDocument({ data, company }) {
  const r = data?.payrollRecord || data || {};
  const emp = r.employee || {};
  const period = r.period || {};
  const ref = `PP-${period.year || ''}${String(period.month || '').padStart(2, '0')}-${r.id || data?.id || ''}`;

  const earnings = [
    ['Basic salary', r.basic],
    ['Allowances', r.allowances],
    ['Overtime', r.overtime],
    ['Adjustment (credit)', Number(r.adjustment) > 0 ? r.adjustment : 0],
  ];
  const deductions = [
    ['Unpaid leave', r.unpaidLeaveDeduction],
    ['Employee SSF', r.employeeSSF],
    ['Employee PF', r.employeePF],
    ['Tax', r.tax],
    ['Other deductions', r.otherDeductions],
    ['Adjustment (debit)', Number(r.adjustment) < 0 ? Math.abs(Number(r.adjustment)) : 0],
  ];

  const earnTotal = earnings.reduce((s, [, v]) => s + Number(v || 0), 0);
  const dedTotal = deductions.reduce((s, [, v]) => s + Number(v || 0), 0);

  const companyName = company?.companyName || 'PayrollPro';
  const companyLine = [company?.address, company?.phone].filter(Boolean).join('  ·  ');

  return (
    <article className="payslip-sheet mx-auto w-full max-w-[210mm] overflow-hidden rounded-sm bg-white text-slate-800 shadow-xl ring-1 ring-slate-200">
      {/* Header */}
      <header className="relative bg-slate-900 px-8 pb-6 pt-7 text-white">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-brand-600/30 to-transparent" />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold">
              P
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-300">
                PayrollPro
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{companyName}</h1>
              <p className="mt-1 text-[11px] text-slate-300">
                {companyLine || 'Enterprise Payroll & HR Management'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Payslip</p>
            <p className="mt-1 text-lg font-semibold">{periodLabel(period.year, period.month)}</p>
            <p className="mt-1 font-mono text-[11px] text-slate-400">{ref}</p>
          </div>
        </div>
      </header>

      {/* Employee meta */}
      <section className="grid grid-cols-2 gap-x-8 gap-y-3 border-b border-slate-100 bg-slate-50 px-8 py-5 text-sm">
        <Meta label="Employee" value={`${emp.firstName || ''} ${emp.lastName || ''}`.trim() || '—'} />
        <Meta label="Employee ID" value={emp.employeeCode || '—'} mono />
        <Meta label="Department" value={emp.department?.name || '—'} />
        <Meta label="Designation" value={emp.designation?.title || '—'} />
        <Meta label="Branch" value={emp.branch?.name || '—'} />
        <Meta label="Pay period" value={periodLabel(period.year, period.month)} />
      </section>

      {/* Earnings / Deductions */}
      <section className="grid grid-cols-2 gap-0 px-0">
        <Column title="Earnings" rows={earnings} totalLabel="Total earnings" total={earnTotal} accent />
        <Column title="Deductions" rows={deductions} totalLabel="Total deductions" total={dedTotal} />
      </section>

      {/* Net pay */}
      <section className="flex items-center justify-between bg-slate-900 px-8 py-5 text-white">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Net pay
          </p>
          <p className="mt-1 text-xs text-slate-400">Gross {money(r.gross)} − deductions</p>
        </div>
        <p className="text-3xl font-semibold tracking-tight">{money(r.net)}</p>
      </section>

      <footer className="flex items-start justify-between gap-6 px-8 py-4 text-[10px] leading-relaxed text-slate-500">
        <p>
          This is a computer-generated payslip. Statutory items (SSF, PF, tax) use the
          configuration stored in PayrollPro at the time of processing.
        </p>
        <p className="shrink-0 text-right">
          Generated {new Date().toLocaleDateString()}
          <br />
          Confidential
        </p>
      </footer>
    </article>
  );
}

function Meta({ label, value, mono }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-medium text-slate-800 ${mono ? 'font-mono text-brand-700' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function Column({ title, rows, totalLabel, total, accent }) {
  return (
    <div className={`px-8 py-5 ${accent ? 'border-r border-slate-100' : ''}`}>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {title}
      </p>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b border-slate-50">
              <td className="py-1.5 text-slate-600">{label}</td>
              <td className="py-1.5 text-right font-medium tabular-nums">{money(value)}</td>
            </tr>
          ))}
          <tr>
            <td className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {totalLabel}
            </td>
            <td className="pt-3 text-right font-semibold tabular-nums">{money(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
