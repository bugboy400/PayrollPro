import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function AttendancePage() {
  const { user, hasRole } = useAuth();
  const isEmployee = user?.role === 'EMPLOYEE';
  const isManager = hasRole('ADMIN', 'HR');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      if (isEmployee) {
        const { data } = await api.get('/attendance');
        setRows(Array.isArray(data) ? data : data.data || []);
      } else {
        const { data } = await api.get('/attendance', { params: { date } });
        setRows(Array.isArray(data) ? data : data.data || []);
      }
      if (isManager) {
        try {
          const { data: p } = await api.get('/attendance/pending');
          setPending(Array.isArray(p) ? p : p.data || []);
        } catch {
          setPending([]);
        }
      }
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date, user?.role]);

  const checkIn = async () => {
    setBusy(true);
    try {
      await api.post('/attendance/check-in');
      toast.success('Check-in submitted');
      load();
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setBusy(false);
    }
  };

  const checkOut = async () => {
    setBusy(true);
    try {
      await api.post('/attendance/check-out');
      toast.success('Check-out submitted');
      load();
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setBusy(false);
    }
  };

  const approveRequest = async (requestId) => {
    try {
      await api.post(`/attendance/requests/${requestId}/approve`);
      toast.success('Approved');
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const rejectRequest = async (requestId) => {
    const reason = window.prompt('Rejection reason (optional)') || '';
    try {
      await api.post(`/attendance/requests/${requestId}/reject`, { reason });
      toast.success('Rejected');
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const todayRow = isEmployee
    ? rows.find((r) => {
        const d = r.workDate ? new Date(r.workDate).toISOString().slice(0, 10) : '';
        return d === new Date().toISOString().slice(0, 10);
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
          <p className="text-sm text-slate-500">
            {isEmployee
              ? 'Your check-in / check-out and history'
              : 'Team attendance and approvals'}
          </p>
        </div>
        {!isEmployee && (
          <input
            type="date"
            className="input w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </div>

      {isEmployee && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Today</h2>
          <p className="mt-1 text-sm text-slate-500">
            Status:{' '}
            <span className="font-medium text-slate-800">
              {todayRow?.displayStatus ||
                (todayRow?.checkOut
                  ? 'CHECKED_OUT'
                  : todayRow?.checkIn
                    ? 'CHECKED_IN'
                    : 'NOT_CHECKED_IN')}
            </span>
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={checkIn}
            >
              {busy ? 'Working…' : 'Check in'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={checkOut}
            >
              Check out
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Uses <code>POST /api/attendance/check-in</code> and{' '}
            <code>POST /api/attendance/check-out</code>. Approval may be required by HR.
          </p>
        </div>
      )}

      {isManager && pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">Pending requests</h2>
          <ul className="mt-3 space-y-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm"
              >
                <span>
                  #{r.id} · {r.type} · Attendance {r.attendanceId}
                  {r.eventTime ? ` · ${new Date(r.eventTime).toLocaleString()}` : ''}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary text-xs"
                    onClick={() => approveRequest(r.id)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => rejectRequest(r.id)}
                  >
                    Reject
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {!isEmployee && <th className="px-4 py-3">Employee</th>}
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Check-in</th>
                <th className="px-4 py-3">Check-out</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Worked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No attendance records
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id || `${r.employeeId}-${r.workDate}`}>
                    {!isEmployee && (
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-brand-600">
                          {r.employee?.employeeCode}
                        </span>{' '}
                        {r.employee?.firstName} {r.employee?.lastName}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {r.workDate ? new Date(r.workDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '—'}
                      {r.checkInStatus && (
                        <span className="ml-1 text-xs text-slate-400">({r.checkInStatus})</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '—'}
                      {r.checkOutStatus && (
                        <span className="ml-1 text-xs text-slate-400">({r.checkOutStatus})</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge bg-slate-100 text-slate-700">
                        {r.displayStatus || r.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.workedDurationMinutes != null
                        ? `${Math.floor(r.workedDurationMinutes / 60)}h ${r.workedDurationMinutes % 60}m`
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
