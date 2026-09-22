import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';

const emptyForm = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  joiningDate: '',
  branchId: '',
  departmentId: '',
  designationId: '',
  basicSalary: 0,
  housingAllowance: 0,
  transportAllowance: 0,
  otherAllowance: 0,
  overtimeRate: 0,
};

export default function EmployeesPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole('ADMIN', 'HR');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [saving, setSaving] = useState(false);
  const limit = 20;

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/employees', { params: { q: q || undefined, page, limit } });
      if (Array.isArray(data)) {
        setRows(data);
        setTotal(data.length);
      } else {
        setRows(data.data || data.employees || []);
        setTotal(data.total || data.count || 0);
      }
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page]);

  useEffect(() => {
    if (!canManage) return;
    Promise.all([
      api.get('/org/branches'),
      api.get('/org/departments'),
      api.get('/org/designations'),
    ]).then(([b, d, des]) => {
      setBranches(Array.isArray(b.data) ? b.data : []);
      setDepartments(Array.isArray(d.data) ? d.data : []);
      setDesignations(Array.isArray(des.data) ? des.data : []);
    }).catch(() => {});
  }, [canManage]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/employees', {
        ...form,
        branchId: Number(form.branchId),
        departmentId: Number(form.departmentId),
        designationId: Number(form.designationId),
        basicSalary: Number(form.basicSalary),
        housingAllowance: Number(form.housingAllowance),
        transportAllowance: Number(form.transportAllowance),
        otherAllowance: Number(form.otherAllowance),
        overtimeRate: Number(form.overtimeRate),
      });
      toast.success('Employee created');
      setShowCreate(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setSaving(false);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500">Directory and workforce records</p>
        </div>
        {canManage && (
          <button type="button" className="btn-primary" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4" />
            {showCreate ? 'Cancel' : 'Add employee'}
          </button>
        )}
      </div>

      {showCreate && canManage && (
        <form onSubmit={create} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold">Create employee</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className="label">First name *</label><input className="input" required value={form.firstName} onChange={set('firstName')} /></div>
            <div><label className="label">Middle name</label><input className="input" value={form.middleName} onChange={set('middleName')} /></div>
            <div><label className="label">Last name *</label><input className="input" required value={form.lastName} onChange={set('lastName')} /></div>
            <div><label className="label">Email *</label><input type="email" className="input" required value={form.email} onChange={set('email')} /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={set('phone')} /></div>
            <div><label className="label">Joining date *</label><input type="date" className="input" required value={form.joiningDate} onChange={set('joiningDate')} /></div>
            <div className="sm:col-span-2 lg:col-span-3"><label className="label">Address</label><input className="input" value={form.address} onChange={set('address')} /></div>
            <div>
              <label className="label">Branch *</label>
              <select className="input" required value={form.branchId} onChange={set('branchId')}>
                <option value="">Select…</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Department *</label>
              <select className="input" required value={form.departmentId} onChange={set('departmentId')}>
                <option value="">Select…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Designation *</label>
              <select className="input" required value={form.designationId} onChange={set('designationId')}>
                <option value="">Select…</option>
                {designations.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </div>
            <div><label className="label">Basic salary</label><input type="number" className="input" value={form.basicSalary} onChange={set('basicSalary')} /></div>
            <div><label className="label">Housing</label><input type="number" className="input" value={form.housingAllowance} onChange={set('housingAllowance')} /></div>
            <div><label className="label">Transport</label><input type="number" className="input" value={form.transportAllowance} onChange={set('transportAllowance')} /></div>
          </div>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create employee'}</button>
        </form>
      )}

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search by EMPID, name, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Designation</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No employees found</td></tr>
              ) : (
                rows.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-brand-600">{emp.employeeCode}</td>
                    <td className="px-4 py-3 font-medium">{emp.firstName} {emp.lastName}</td>
                    <td className="px-4 py-3 text-slate-600">{emp.department?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{emp.designation?.title || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${emp.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{emp.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/employees/${emp.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">View</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > limit && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-sm text-slate-500">Page {page} · {total} total</p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" className="btn-secondary px-2" disabled={page * limit >= total} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
