import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';

export default function PermissionsPage() {
  const [users, setUsers] = useState([]);
  const [allPerms, setAllPerms] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userPerms, setUserPerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/users'), api.get('/permissions').catch(() => ({ data: [] }))])
      .then(([u, p]) => {
        setUsers(Array.isArray(u.data) ? u.data : []);
        setAllPerms(Array.isArray(p.data) ? p.data : []);
      })
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setUserPerms([]);
      return;
    }
    api
      .get(`/users/${selectedUserId}/permissions`)
      .then(({ data }) => setUserPerms(data.permissions || []))
      .catch((err) => toast.error(getError(err)));
  }, [selectedUserId]);

  const toggle = (code) => {
    setUserPerms((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const save = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/users/${selectedUserId}/permissions`, {
        permissions: userPerms,
      });
      setUserPerms(data.permissions || userPerms);
      toast.success('Permissions saved (stored on the user; menus still follow role)');
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setSaving(false);
    }
  };

  const selected = users.find((u) => String(u.id) === String(selectedUserId));

  const fallbackPerms = [
    { code: 'EMPLOYEE_VIEW', name: 'View employees' },
    { code: 'EMPLOYEE_CREATE', name: 'Create employees' },
    { code: 'EMPLOYEE_EDIT', name: 'Edit employees' },
    { code: 'SALARY_VIEW', name: 'View salary' },
    { code: 'SALARY_EDIT', name: 'Edit salary' },
    { code: 'ATTENDANCE_VIEW', name: 'View attendance' },
    { code: 'ATTENDANCE_EDIT', name: 'Edit attendance' },
    { code: 'LEAVE_VIEW', name: 'View leave' },
    { code: 'LEAVE_MANAGE', name: 'Manage leave' },
    { code: 'LEAVE_APPROVE', name: 'Approve leave' },
    { code: 'PAYROLL_VIEW', name: 'View payroll' },
    { code: 'PAYROLL_PROCESS', name: 'Process payroll' },
    { code: 'PAYROLL_APPROVE', name: 'Approve payroll' },
    { code: 'PAYSLIP_VIEW', name: 'View payslips' },
    { code: 'PAYSLIP_GENERATE', name: 'Generate payslips' },
    { code: 'REPORT_CREATE', name: 'Create reports' },
    { code: 'REPORT_VIEW_OWN', name: 'View own reports' },
    { code: 'REPORT_VIEW_ASSIGNED', name: 'View assigned reports' },
    { code: 'REPORT_VIEW_ALL', name: 'View all reports' },
    { code: 'REPORT_ASSIGN', name: 'Assign reports' },
    { code: 'REPORT_UPDATE', name: 'Update reports' },
    { code: 'REPORT_RESOLVE', name: 'Resolve reports' },
    { code: 'USER_VIEW', name: 'View users' },
    { code: 'USER_CREATE', name: 'Create users' },
    { code: 'USER_EDIT', name: 'Edit users' },
    { code: 'USER_DEACTIVATE', name: 'Activate/deactivate users' },
    { code: 'PERMISSION_VIEW', name: 'View permissions' },
    { code: 'PERMISSION_GRANT', name: 'Grant permissions' },
    { code: 'PERMISSION_REVOKE', name: 'Revoke permissions' },
    { code: 'AUDIT_VIEW', name: 'View audit records' },
    { code: 'COMPANY_SETTINGS_MANAGE', name: 'Manage company profile' },
    { code: 'SECURITY_SETTINGS_MANAGE', name: 'Manage security settings' },
  ];

  const permList = allPerms.length > 0 ? allPerms : fallbackPerms;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Permissions</h1>
        <p className="text-sm text-slate-500">
          Extra permission codes stored on the user. Menus and most APIs still follow <strong>role</strong>.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">How this actually works in your backend</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Almost every write API uses <code>allow(Role…)</code>, not these codes. Example:{' '}
            <code>POST /api/employees</code> is <strong>HR and Admin only</strong>. Giving a Payroll
            Manager <code>EMPLOYEE_CREATE</code> does <strong>not</strong> unlock Create employee.
          </li>
          <li>
            The only routes that check these codes are viewing the permission list itself (
            <code>PERMISSION_VIEW</code>). Saving here writes <code>userPermission</code> rows, but
            it will not change sidebar, salary, payroll, or employee screens.
          </li>
          <li>
            To let Payroll Manager create employees, the backend route must change from{' '}
            <code>allow(Role.HR, Role.ADMIN)</code> to also include <code>PAYROLL_MANAGER</code> (or
            switch that route to <code>permission("EMPLOYEE_CREATE")</code>).
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="label">Select user</label>
        <select
          className="input max-w-md"
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
        >
          <option value="">Choose a user…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email} ({u.role?.replace('_', ' ')})
              {u.employee ? ` — ${u.employee.employeeCode}` : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedUserId && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">{selected?.email}</h2>
              <p className="text-sm text-slate-500">
                Role: {selected?.role?.replace('_', ' ')}
                {selected?.role === 'ADMIN' && ' (Admin has all permissions by default)'}
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={saving || selected?.role === 'ADMIN'}
              onClick={save}
            >
              {saving ? 'Saving…' : 'Save permissions'}
            </button>
          </div>

          <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {permList.map((p) => {
              const code = p.code || p;
              const name = p.name || p.description || code;
              const checked = userPerms.includes(code);
              return (
                <label
                  key={code}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
                    checked
                      ? 'border-brand-200 bg-brand-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    disabled={selected?.role === 'ADMIN'}
                    onChange={() => toggle(code)}
                  />
                  <span>
                    <span className="block font-medium text-slate-800">{name}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-slate-400">{code}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
