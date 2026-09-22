import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Schema LeaveType fields:
 * name, code, description, payment (PAID|UNPAID), paymentPolicy,
 * accrualType, annualEntitlement, carryForward, requiresReason, isActive
 */
export default function LeavePage() {
  const { hasRole, user } = useAuth();
  const canManage = hasRole('ADMIN', 'HR');
  const canApprove = canManage;

  const [tab, setTab] = useState('requests'); // requests | types | balances
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    reason: '',
    payment: 'PAID',
  });

  const [typeForm, setTypeForm] = useState({
    name: '',
    code: '',
    description: '',
    payment: 'PAID',
    paymentPolicy: 'EMPLOYEE_CHOICE',
    accrualType: 'ANNUAL',
    annualEntitlement: '12',
    carryForward: '0',
    requiresReason: true,
    isActive: true,
  });
  const [editingTypeId, setEditingTypeId] = useState(null);
  const [savingType, setSavingType] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [l, t, b] = await Promise.all([
        api.get('/leaves'),
        api.get('/leave-types').catch(() => ({ data: [] })),
        api.get('/leave-balances/me').catch(() => ({ data: [] })),
      ]);
      setRows(Array.isArray(l.data) ? l.data : l.data?.data || []);
      setTypes(Array.isArray(t.data) ? t.data : t.data?.data || []);
      setBalances(Array.isArray(b.data) ? b.data : b.data?.balances || []);
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitLeave = async (e) => {
    e.preventDefault();
    try {
      await api.post('/leaves', {
        leaveTypeId: Number(form.leaveTypeId),
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason || null,
        payment: form.payment,
      });
      toast.success('Leave request submitted');
      setShowForm(false);
      setForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '', payment: 'PAID' });
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const act = async (id, action) => {
    try {
      if (action === 'approve') {
        await api.post(`/leaves/${id}/approve`);
      } else {
        const rejectionReason = window.prompt('Rejection reason') || '';
        if (!rejectionReason.trim()) {
          toast.error('Rejection reason is required');
          return;
        }
        await api.post(`/leaves/${id}/reject`, {
          rejectionReason: rejectionReason.trim(),
          reason: rejectionReason.trim(),
        });
      }
      toast.success(action === 'approve' ? 'Approved' : 'Rejected');
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const resetTypeForm = () => {
    setEditingTypeId(null);
    setTypeForm({
      name: '',
      code: '',
      description: '',
      payment: 'PAID',
      paymentPolicy: 'EMPLOYEE_CHOICE',
      accrualType: 'ANNUAL',
      annualEntitlement: '12',
      carryForward: '0',
      requiresReason: true,
      isActive: true,
    });
  };

  const startEditType = (t) => {
    setEditingTypeId(t.id);
    setTypeForm({
      name: t.name || '',
      code: t.code || '',
      description: t.description || '',
      payment: t.payment || 'PAID',
      paymentPolicy: t.paymentPolicy || 'EMPLOYEE_CHOICE',
      accrualType: t.accrualType || 'ANNUAL',
      annualEntitlement: String(t.annualEntitlement ?? t.daysPerYear ?? 0),
      carryForward: String(t.carryForward ?? 0),
      requiresReason: t.requiresReason !== false,
      isActive: t.isActive !== false,
    });
    setTab('types');
  };

  const saveType = async (e) => {
    e.preventDefault();
    if (!typeForm.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSavingType(true);
    const payload = {
      name: typeForm.name.trim(),
      code: typeForm.code.trim() || undefined,
      description: typeForm.description.trim() || null,
      payment: typeForm.payment,
      paymentPolicy: typeForm.paymentPolicy,
      accrualType: typeForm.accrualType,
      annualEntitlement: Number(typeForm.annualEntitlement) || 0,
      carryForward: Number(typeForm.carryForward) || 0,
      requiresReason: Boolean(typeForm.requiresReason),
      isActive: Boolean(typeForm.isActive),
    };
    try {
      if (editingTypeId) {
        await api.patch(`/leave-types/${editingTypeId}`, payload);
        toast.success('Leave type updated');
      } else {
        await api.post('/leave-types', payload);
        toast.success('Leave type created');
      }
      resetTypeForm();
      load();
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setSavingType(false);
    }
  };

  const statusColor = (s) => {
    const map = {
      PENDING: 'bg-amber-100 text-amber-800',
      APPROVED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      CANCELLED: 'bg-slate-100 text-slate-600',
      PROPOSED: 'bg-blue-100 text-blue-800',
    };
    return map[s] || 'bg-slate-100 text-slate-600';
  };

  const tabs = [
    { id: 'requests', label: 'Requests' },
    ...(canManage ? [{ id: 'types', label: 'Leave types' }] : []),
    { id: 'balances', label: 'Balances' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave</h1>
          <p className="text-sm text-slate-500">
            {canManage
              ? 'Requests, leave type configuration, and balances'
              : 'Submit requests and view your balances'}
          </p>
        </div>
        {tab === 'requests' && (
          <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Submit leave'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.id
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ——— REQUESTS ——— */}
      {tab === 'requests' && (
        <>
          {showForm && (
            <form
              onSubmit={submitLeave}
              className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2"
            >
              <div>
                <label className="label">Leave type</label>
                <select
                  className="input"
                  required
                  value={form.leaveTypeId}
                  onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}
                >
                  <option value="">Select…</option>
                  {types.filter((t) => t.isActive !== false).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.annualEntitlement != null
                        ? ` (${t.annualEntitlement} days/year)`
                        : ''}
                    </option>
                  ))}
                </select>
                {types.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    No leave types yet.
                    {canManage
                      ? ' Open the “Leave types” tab to create Annual, Sick, etc.'
                      : ' Ask HR to configure leave types.'}
                  </p>
                )}
              </div>
              <div>
                <label className="label">Payment</label>
                <select
                  className="input"
                  value={form.payment}
                  onChange={(e) => setForm({ ...form, payment: e.target.value })}
                >
                  <option value="PAID">Paid</option>
                  <option value="UNPAID">Unpaid</option>
                </select>
              </div>
              <div>
                <label className="label">Start</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div>
                <label className="label">End</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Reason</label>
                <input
                  className="input"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="btn-primary">
                  Submit request
                </button>
              </div>
            </form>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {canManage && <th className="px-4 py-3">Employee</th>}
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Days</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Status</th>
                    {canApprove && <th className="px-4 py-3">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                        Loading…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                        No leave requests
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id}>
                        {canManage && (
                          <td className="px-4 py-3">
                            {r.employee
                              ? `${r.employee.firstName || ''} ${r.employee.lastName || ''}`.trim()
                              : r.employeeId}
                          </td>
                        )}
                        <td className="px-4 py-3">{r.leaveType?.name || r.leaveTypeId}</td>
                        <td className="px-4 py-3">
                          {r.startDate ? new Date(r.startDate).toLocaleDateString() : '—'} →{' '}
                          {r.endDate ? new Date(r.endDate).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3">{Number(r.days)}</td>
                        <td className="px-4 py-3">{r.payment || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`badge ${statusColor(r.status)}`}>{r.status}</span>
                        </td>
                        {canApprove && (
                          <td className="px-4 py-3">
                            {r.status === 'PENDING' ? (
                              <span className="flex gap-1">
                                <button
                                  type="button"
                                  className="btn-primary px-2 py-1 text-xs"
                                  onClick={() => act(r.id, 'approve')}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary px-2 py-1 text-xs"
                                  onClick={() => act(r.id, 'reject')}
                                >
                                  Reject
                                </button>
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ——— LEAVE TYPES (Admin / HR) ——— */}
      {tab === 'types' && canManage && (
        <div className="space-y-4">
          <form
            onSubmit={saveType}
            className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
          >
            <div className="sm:col-span-2 lg:col-span-3">
              <h2 className="font-semibold text-slate-900">
                {editingTypeId ? `Edit leave type #${editingTypeId}` : 'Create leave type'}
              </h2>
              <p className="text-xs text-slate-500">
                Matches schema: annualEntitlement, payment (PAID/UNPAID), paymentPolicy, accrualType
              </p>
            </div>
            <div>
              <label className="label">Name *</label>
              <input
                className="input"
                required
                placeholder="e.g. Annual Leave"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Code</label>
              <input
                className="input"
                placeholder="e.g. ANNUAL (auto if empty)"
                value={typeForm.code}
                onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Days / year</label>
              <input
                type="number"
                min="0"
                step="0.5"
                className="input"
                value={typeForm.annualEntitlement}
                onChange={(e) => setTypeForm({ ...typeForm, annualEntitlement: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Payment default</label>
              <select
                className="input"
                value={typeForm.payment}
                onChange={(e) => setTypeForm({ ...typeForm, payment: e.target.value })}
              >
                <option value="PAID">PAID</option>
                <option value="UNPAID">UNPAID</option>
              </select>
            </div>
            <div>
              <label className="label">Payment policy</label>
              <select
                className="input"
                value={typeForm.paymentPolicy}
                onChange={(e) => setTypeForm({ ...typeForm, paymentPolicy: e.target.value })}
              >
                <option value="EMPLOYEE_CHOICE">Employee choice</option>
                <option value="PAID_ONLY">Paid only</option>
                <option value="UNPAID_ONLY">Unpaid only</option>
                <option value="HR_DECIDES">HR decides</option>
              </select>
            </div>
            <div>
              <label className="label">Accrual</label>
              <select
                className="input"
                value={typeForm.accrualType}
                onChange={(e) => setTypeForm({ ...typeForm, accrualType: e.target.value })}
              >
                <option value="ANNUAL">Annual</option>
                <option value="MONTHLY">Monthly</option>
                <option value="NONE">None</option>
              </select>
            </div>
            <div>
              <label className="label">Carry forward (days)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                className="input"
                value={typeForm.carryForward}
                onChange={(e) => setTypeForm({ ...typeForm, carryForward: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={typeForm.requiresReason}
                  onChange={(e) => setTypeForm({ ...typeForm, requiresReason: e.target.checked })}
                />
                Requires reason
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={typeForm.isActive}
                  onChange={(e) => setTypeForm({ ...typeForm, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="label">Description</label>
              <input
                className="input"
                value={typeForm.description}
                onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <button type="submit" className="btn-primary" disabled={savingType}>
                {savingType ? 'Saving…' : editingTypeId ? 'Update type' : 'Create type'}
              </button>
              {editingTypeId && (
                <button type="button" className="btn-secondary" onClick={resetTypeForm}>
                  Cancel edit
                </button>
              )}
            </div>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Days/year</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Policy</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {types.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      No leave types. Create Annual, Sick, Casual, etc. above.
                    </td>
                  </tr>
                ) : (
                  types.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-3 font-medium">{t.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{t.code || '—'}</td>
                      <td className="px-4 py-3">
                        {Number(t.annualEntitlement ?? t.daysPerYear ?? 0)}
                      </td>
                      <td className="px-4 py-3">{t.payment || '—'}</td>
                      <td className="px-4 py-3 text-xs">{t.paymentPolicy || '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge ${
                            t.isActive !== false
                              ? 'bg-green-100 text-green-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {t.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="btn-secondary px-2 py-1 text-xs"
                          onClick={() => startEditType(t)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ——— BALANCES ——— */}
      {tab === 'balances' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {balances.length === 0 ? (
            <p className="text-sm text-slate-500 sm:col-span-2 lg:col-span-3">
              No leave balances yet. Balances are created when leave is approved (or seeded by HR).
            </p>
          ) : (
            balances.map((b) => {
              const available =
                Number(b.opening || 0) +
                Number(b.accrued || 0) +
                Number(b.adjustment || 0) -
                Number(b.used || 0);
              return (
                <div
                  key={b.id || `${b.leaveTypeId}-${b.year}`}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-sm text-slate-500">
                    {b.leaveType?.name || `Type #${b.leaveTypeId}`} · {b.year}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{available}</p>
                  <p className="text-xs text-slate-400">
                    available · used {Number(b.used || 0)} · opening {Number(b.opening || 0)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
