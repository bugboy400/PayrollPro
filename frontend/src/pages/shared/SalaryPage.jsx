import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Search } from 'lucide-react';

export default function SalaryPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('HR', 'PAYROLL_MANAGER', 'ADMIN');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = () => {
    setLoading(true);
    api
      .get('/salary')
      .then(({ data }) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    const emp = r.employee || {};
    return (
      emp.employeeCode?.toLowerCase().includes(s) ||
      emp.firstName?.toLowerCase().includes(s) ||
      emp.lastName?.toLowerCase().includes(s) ||
      emp.email?.toLowerCase().includes(s)
    );
  });

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      basicSalary: Number(row.basicSalary || 0),
      housingAllowance: Number(row.housingAllowance || 0),
      transportAllowance: Number(row.transportAllowance || 0),
      otherAllowance: Number(row.otherAllowance || 0),
      overtimeRate: Number(row.overtimeRate || 0),
      employeeSSF: Number(row.employeeSSF || 0),
      employerSSF: Number(row.employerSSF || 0),
      employeePF: Number(row.employeePF || 0),
      employerPF: Number(row.employerPF || 0),
      reason: '',
      effectiveFrom: row.effectiveFrom
        ? new Date(row.effectiveFrom).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    });
  };

  const setNum = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await api.put(`/salary/${editing.employeeId}`, form);
      toast.success('Salary updated');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const money = (v) =>
    Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

  const Field = ({ label, k, required }) => (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        step="0.01"
        className="input"
        value={form[k] ?? ''}
        onChange={setNum(k)}
        required={required}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Salary</h1>
        <p className="text-sm text-slate-500">Salary structures for employees</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search by EMPID, name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Basic</th>
                <th className="px-4 py-3 font-medium">Allowances</th>
                <th className="px-4 py-3 font-medium">OT rate</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    No salary records
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id || r.employeeId} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-brand-600">
                        {r.employee?.employeeCode}
                      </span>
                      <span className="ml-2 font-medium">
                        {r.employee?.firstName} {r.employee?.lastName}
                      </span>
                    </td>
                    <td className="px-4 py-3">{money(r.basicSalary)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {money(
                        Number(r.housingAllowance || 0) +
                          Number(r.transportAllowance || 0) +
                          Number(r.otherAllowance || 0)
                      )}
                    </td>
                    <td className="px-4 py-3">{money(r.overtimeRate)}</td>
                    <td className="px-4 py-3 text-right">
                      {canEdit && (
                        <button
                          type="button"
                          className="text-sm font-medium text-brand-600 hover:text-brand-700"
                          onClick={() => openEdit(r)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              Edit salary — {editing.employee?.employeeCode} {editing.employee?.firstName}
            </h2>
            <form onSubmit={save} className="mt-4 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Basic salary" k="basicSalary" required />
                <Field label="Overtime rate" k="overtimeRate" />
                <Field label="Housing allowance" k="housingAllowance" />
                <Field label="Transport allowance" k="transportAllowance" />
                <Field label="Other allowance" k="otherAllowance" />
                <div>
                  <label className="label">Effective from</label>
                  <input
                    type="date"
                    className="input"
                    value={form.effectiveFrom}
                    onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Statutory amounts (SSF / PF)
                </p>
                <p className="mb-3 text-xs text-slate-500">
                  Saved on the salary structure via PUT /salary/:employeeId. Payroll uses these
                  stored amounts when processing.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Employee SSF" k="employeeSSF" />
                  <Field label="Employer SSF" k="employerSSF" />
                  <Field label="Employee PF" k="employeePF" />
                  <Field label="Employer PF" k="employerPF" />
                </div>
              </div>

              <div>
                <label className="label">Reason (logged if basic changes)</label>
                <input
                  className="input"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
