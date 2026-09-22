import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function OrgPage() {
  const { hasRole } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [branchForm, setBranchForm] = useState({ name: '', address: '' });
  const [deptForm, setDeptForm] = useState({ name: '', code: '' });
  const [desForm, setDesForm] = useState({ title: '', departmentId: '' });
  const [showBranch, setShowBranch] = useState(false);
  const [showDept, setShowDept] = useState(false);
  const [showDes, setShowDes] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/org/departments'),
      api.get('/org/designations'),
      api.get('/org/branches'),
    ])
      .then(([d, des, b]) => {
        setDepartments(Array.isArray(d.data) ? d.data : []);
        setDesignations(Array.isArray(des.data) ? des.data : []);
        setBranches(Array.isArray(b.data) ? b.data : []);
      })
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const createBranch = async (e) => {
    e.preventDefault();
    try {
      await api.post('/org/branches', branchForm);
      toast.success('Branch created');
      setBranchForm({ name: '', address: '' });
      setShowBranch(false);
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const createDept = async (e) => {
    e.preventDefault();
    try {
      await api.post('/org/departments', deptForm);
      toast.success('Department created');
      setDeptForm({ name: '', code: '' });
      setShowDept(false);
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const createDes = async (e) => {
    e.preventDefault();
    try {
      await api.post('/org/designations', {
        title: desForm.title,
        departmentId: desForm.departmentId ? Number(desForm.departmentId) : undefined,
      });
      toast.success('Designation created');
      setDesForm({ title: '', departmentId: '' });
      setShowDes(false);
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const remove = async (type, id) => {
    if (!confirm('Delete this item?')) return;
    try {
      await api.delete(`/org/${type}/${id}`);
      toast.success('Deleted');
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

  return (
    <div className="space-y-6">
      {/* Branches */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Branches</h2>
            <p className="text-sm text-slate-500">Manage company branches and locations.</p>
          </div>
          {hasRole('ADMIN') && (
            <button className="btn-primary text-sm" onClick={() => setShowBranch(!showBranch)}>
              {showBranch ? 'Cancel' : 'Add Branch'}
            </button>
          )}
        </div>

        {showBranch && (
          <form onSubmit={createBranch} className="flex flex-wrap gap-3 border-b border-slate-100 px-5 py-4">
            <input
              className="input max-w-xs"
              placeholder="Branch name"
              value={branchForm.name}
              onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
              required
            />
            <input
              className="input max-w-sm flex-1"
              placeholder="Address"
              value={branchForm.address}
              onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
            />
            <button type="submit" className="btn-primary">Save</button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Address</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {branches.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-8 text-center text-slate-400">No branches yet</td></tr>
              ) : (
                branches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3 font-medium text-slate-800">{b.name}</td>
                    <td className="px-5 py-3 text-slate-600">{b.address || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      {hasRole('ADMIN') && (
                        <button className="text-sm text-red-600 hover:text-red-700" onClick={() => remove('branches', b.id)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Departments */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Departments</h2>
            <p className="text-sm text-slate-500">Manage company departments.</p>
          </div>
          {hasRole('ADMIN') && (
            <button className="btn-primary text-sm" onClick={() => setShowDept(!showDept)}>
              {showDept ? 'Cancel' : 'Add Department'}
            </button>
          )}
        </div>

        {showDept && (
          <form onSubmit={createDept} className="flex flex-wrap gap-3 border-b border-slate-100 px-5 py-4">
            <input className="input max-w-xs" placeholder="Department name" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} required />
            <input className="input max-w-[140px]" placeholder="Code" value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} required />
            <button type="submit" className="btn-primary">Save</button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {departments.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-8 text-center text-slate-400">No departments yet</td></tr>
              ) : (
                departments.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3 font-medium text-slate-800">{d.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{d.code}</td>
                    <td className="px-5 py-3 text-right">
                      {hasRole('ADMIN') && (
                        <button className="text-sm text-red-600 hover:text-red-700" onClick={() => remove('departments', d.id)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Designations */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Designations</h2>
            <p className="text-sm text-slate-500">Manage employee designations and department assignments.</p>
          </div>
          {hasRole('ADMIN') && (
            <button className="btn-primary text-sm" onClick={() => setShowDes(!showDes)}>
              {showDes ? 'Cancel' : 'Add Designation'}
            </button>
          )}
        </div>

        {showDes && (
          <form onSubmit={createDes} className="flex flex-wrap gap-3 border-b border-slate-100 px-5 py-4">
            <input className="input max-w-xs" placeholder="Title" value={desForm.title} onChange={(e) => setDesForm({ ...desForm, title: e.target.value })} required />
            <select className="input max-w-xs" value={desForm.departmentId} onChange={(e) => setDesForm({ ...desForm, departmentId: e.target.value })}>
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button type="submit" className="btn-primary">Save</button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Title</th>
                <th className="px-5 py-3 font-medium">Department</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {designations.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-8 text-center text-slate-400">No designations yet</td></tr>
              ) : (
                designations.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3 font-medium text-slate-800">{d.title}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {d.department?.name || departments.find((x) => x.id === d.departmentId)?.name || '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {hasRole('ADMIN') && (
                        <button className="text-sm text-red-600 hover:text-red-700" onClick={() => remove('designations', d.id)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
