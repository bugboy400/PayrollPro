import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Search } from 'lucide-react';

export default function SalaryPage() {
  const { hasRole } = useAuth();
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

  const money = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salary</h1>
          <p className="text-sm text-slate-500">Salary structures for employees</p>
        </div>
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

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Basic</th>
                <th className="px-4 py-3 font-medium">Housing</th>
                <th className="px-4 py-3 font-medium">Transport</th>
                <th className="px-4 py-3 font-medium">Other</th>
                <th className="px-4 py-3 font-medium">Overtime rate</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">No salary records</td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id || r.employeeId} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-brand-600">{r.employee?.employeeCode}</span>
                      <span className="ml-2 font-medium">
                        {r.employee?.firstName} {r.employee?.lastName}
                      </span>
                    </td>
                    <td className="px-4 py-3">{money(r.basicSalary)}</td>
                    <td className="px-4 py-3">{money(r.housingAllowance)}</td>
                    <td className="px-4 py-3">{money(r.transportAllowance)}</td>
                    <td className="px-4 py-3">{money(r.otherAllowance)}</td>
                    <td className="px-4 py-3">{money(r.overtimeRate)}</td>
                    <td className="px-4 py-3 text-right">
                      {hasRole('HR', 'PAYROLL_MANAGER', 'ADMIN') && (
                        <button
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

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              Edit salary — {editing.employee?.employeeCode} {editing.employee?.firstName}
            </h2>
            <form onSubmit={save} className="mt-4 space-y-3">
              {[
                ['basicSalary', 'Basic salary'],
                ['housingAllowance', 'Housing allowance'],
                ['transportAllowance', 'Transport allowance'],
                ['otherAllowance', 'Other allowance'],
                ['overtimeRate', 'Overtime rate'],
                ['employeeSSF', 'Employee SSF'],
                ['employerSSF', 'Employer SSF'],
                ['employeePF', 'Employee PF / EPF'],
                ['employerPF', 'Employer PF / EPF'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    required={key === 'basicSalary'}
                  />
                </div>
              ))}
              <div>
                <label className="label">Effective from</label>
                <input
                  type="date"
                  className="input"
                  value={form.effectiveFrom}
                  onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Reason (for basic change)</label>
                <input
                  className="input"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
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
