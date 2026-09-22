import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft } from 'lucide-react';

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'HR');
  const [emp, setEmp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);

  const load = () => {
    setLoading(true);
    api
      .get(`/employees/${id}`)
      .then(({ data }) => {
        setEmp(data);
        setForm({
          firstName: data.firstName || '',
          middleName: data.middleName || '',
          lastName: data.lastName || '',
          phone: data.phone || '',
          address: data.address || '',
          status: data.status || 'ACTIVE',
          branchId: data.branchId || data.branch?.id || '',
          departmentId: data.departmentId || data.department?.id || '',
          designationId: data.designationId || data.designation?.id || '',
        });
      })
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (canEdit) {
      Promise.all([api.get('/org/branches'), api.get('/org/departments'), api.get('/org/designations')]).then(
        ([b, d, des]) => {
          setBranches(Array.isArray(b.data) ? b.data : []);
          setDepartments(Array.isArray(d.data) ? d.data : []);
          setDesignations(Array.isArray(des.data) ? des.data : []);
        }
      );
    }
  }, [id]);

  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch(`/employees/${id}`, {
        ...form,
        branchId: form.branchId ? Number(form.branchId) : null,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
        designationId: form.designationId ? Number(form.designationId) : null,
      });
      setEmp(data);
      setEditing(false);
      toast.success('Employee updated');
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }
  if (!emp) return <div className="rounded-xl border bg-white p-6 text-center text-slate-500">Employee not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/employees" className="rounded-lg p-2 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <p className="font-mono text-xs text-brand-600">{emp.employeeCode} 🔒</p>
          <h1 className="text-2xl font-bold">
            {emp.firstName} {emp.middleName} {emp.lastName}
          </h1>
          <p className="text-sm text-slate-500">
            {emp.designation?.title} · {emp.department?.name}
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn-secondary" onClick={() => setEditing(!editing)}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm grid gap-3 sm:grid-cols-2">
          <div><label className="label">First name</label><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
          <div><label className="label">Last name</label><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="TERMINATED">TERMINATED</option>
              <option value="ON_LEAVE">ON_LEAVE</option>
            </select>
          </div>
          <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div>
            <label className="label">Branch</label>
            <select className="input" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select className="input" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Designation</label>
            <select className="input" value={form.designationId} onChange={(e) => setForm({ ...form, designationId: e.target.value })}>
              {designations.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Save changes</button>
          </div>
        </form>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h2 className="font-semibold">Personal</h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Email</dt><dd>{emp.email}</dd>
              <dt className="text-slate-500">Phone</dt><dd>{emp.phone || '—'}</dd>
              <dt className="text-slate-500">Status</dt>
              <dd><span className="badge bg-green-100 text-green-800">{emp.status}</span></dd>
              <dt className="text-slate-500">Joining</dt>
              <dd>{emp.joiningDate ? new Date(emp.joiningDate).toLocaleDateString() : '—'}</dd>
            </dl>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h2 className="font-semibold">Organization</h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Department</dt><dd>{emp.department?.name || '—'}</dd>
              <dt className="text-slate-500">Designation</dt><dd>{emp.designation?.title || '—'}</dd>
              <dt className="text-slate-500">Branch</dt><dd>{emp.branch?.name || '—'}</dd>
            </dl>
          </div>
          {emp.salary && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 lg:col-span-2">
              <h2 className="font-semibold">Salary structure</h2>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <dt className="text-slate-500">Basic</dt><dd className="font-medium">{Number(emp.salary.basicSalary).toLocaleString()}</dd>
                <dt className="text-slate-500">Housing</dt><dd>{Number(emp.salary.housingAllowance || 0).toLocaleString()}</dd>
                <dt className="text-slate-500">Transport</dt><dd>{Number(emp.salary.transportAllowance || 0).toLocaleString()}</dd>
                <dt className="text-slate-500">Other</dt><dd>{Number(emp.salary.otherAllowance || 0).toLocaleString()}</dd>
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
