import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', role: 'HR' });

  const load = () => {
    setLoading(true);
    api
      .get('/users')
      .then(({ data }) => setUsers(Array.isArray(data) ? data : []))
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/users', form);
      toast.success(
        data.activationToken
          ? `Account created. Dev activation token: ${data.activationToken}`
          : 'Account created. Activation email sent.'
      );
      setShowForm(false);
      setForm({ email: '', role: 'HR' });
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const toggleStatus = async (id, isActive) => {
    try {
      await api.patch(`/users/${id}/status`, { isActive: !isActive });
      toast.success(isActive ? 'Deactivated' : 'Reactivated');
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users & Accounts</h1>
          <p className="text-sm text-slate-500">Admin, HR and Payroll Manager accounts only</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Create account'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="card flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="ADMIN">Admin</option>
              <option value="HR">HR</option>
              <option value="PAYROLL_MANAGER">Payroll Manager</option>
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Create
          </button>
        </form>
      )}

      <div className="card overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3">{u.role?.replace('_', ' ')}</td>
                  <td className="px-4 py-3">
                    {u.employee
                      ? `${u.employee.employeeCode} — ${u.employee.firstName} ${u.employee.lastName}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${
                        u.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => toggleStatus(u.id, u.isActive)}
                      >
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={async () => {
                          try {
                            await api.post(`/users/${u.id}/force-password-reset`);
                            toast.success('Password change required at next sign-in');
                          } catch (err) {
                            toast.error(getError(err));
                          }
                        }}
                      >
                        Force reset
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
