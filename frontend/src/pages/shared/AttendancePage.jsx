import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Backend:
 * - Check-in/out create Attendance + AttendanceRequest (PENDING) — NOT auto-approved
 * - Status PRESENT only means a row exists; approval is checkInStatus / checkOutStatus
 * - Approve: POST /api/attendance/requests/:requestId/approve  (AttendanceRequest.id)
 * - Reject:  POST /api/attendance/requests/:requestId/reject   { rejectedReason }
 */
export default function AttendancePage() {
  const { user, hasRole } = useAuth();
  const isEmployee = user?.role === 'EMPLOYEE';
  const canApprove = hasRole('ADMIN', 'HR');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const loadList = async () => {
    setLoading(true);
    try {
      if (isEmployee) {
        const { data } = await api.get('/attendance');
        setRows(Array.isArray(data) ? data : data?.data || []);
      } else {
        // Load a wider window so managers see recent pending days, not only one date
        const { data } = await api.get('/attendance', {
          params: { from: shiftDays(date, -14), to: shiftDays(date, 1) },
        });
        setRows(Array.isArray(data) ? data : data?.data || []);
      }
    } catch (err) {
      // Fallback to single-date query if from/to not supported
      try {
        const { data } = await api.get('/attendance', { params: { date } });
        setRows(Array.isArray(data) ? data : data?.data || []);
      } catch (e2) {
        toast.error(getError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const normalizePending = (data) => {
    const list = Array.isArray(data) ? data : data?.data || data?.requests || [];
    return list.filter(
      (r) =>
        r &&
        r.id != null &&
        String(r.status || 'PENDING').toUpperCase() === 'PENDING' &&
        (r.type === 'CHECK_IN' || r.type === 'CHECK_OUT' || r.type),
    );
  };

  /** Build pending list from nested attendance.requests when /pending is empty */
  const pendingFromRows = (attendanceRows) => {
    const out = [];
    for (const row of attendanceRows || []) {
      const reqs = Array.isArray(row.requests) ? row.requests : [];
      for (const req of reqs) {
        if (String(req.status || '').toUpperCase() !== 'PENDING') continue;
        if (req.type !== 'CHECK_IN' && req.type !== 'CHECK_OUT') continue;
        out.push({
          ...req,
          attendanceId: req.attendanceId ?? row.id,
          attendance: {
            id: row.id,
            workDate: row.workDate,
            employee: row.employee,
            employeeId: row.employeeId,
          },
        });
      }
      // If requests missing but status still PENDING, synthesize a pseudo entry
      // so HR sees something (approve will need real request id from API)
      // Do not invent pending rows without a real AttendanceRequest.id —
      // those cannot be approved via the API.
    }
    // Dedupe by id or attendanceId+type
    const seen = new Set();
    return out.filter((r) => {
      const key = r.id != null ? `id-${r.id}` : `att-${r.attendanceId}-${r.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const loadPending = async (attendanceRows = rows) => {
    if (!canApprove) {
      setPending([]);
      return;
    }
    setPendingLoading(true);
    try {
      let list = [];
      try {
        const { data } = await api.get('/attendance/pending');
        list = normalizePending(data);
      } catch {
        list = [];
      }
      if (list.length === 0) {
        try {
          const { data } = await api.get('/attendance/requests', {
            params: { status: 'PENDING' },
          });
          list = normalizePending(data);
        } catch {
          /* ignore */
        }
      }

      // Merge by attendanceId + type; prefer entries that have a real request id
      const fromRows = pendingFromRows(attendanceRows);
      const byKey = new Map();
      for (const r of [...fromRows, ...list]) {
        const attId = r.attendanceId || r.attendance?.id || '';
        const key = `${attId}-${r.type || ''}`;
        const prev = byKey.get(key);
        if (!prev) {
          byKey.set(key, r);
          continue;
        }
        // Keep the one with a numeric id
        const prevId = prev.id != null && Number(prev.id) > 0;
        const nextId = r.id != null && Number(r.id) > 0;
        if (nextId && !prevId) byKey.set(key, r);
        else if (nextId && prevId && Number(r.id) >= Number(prev.id)) byKey.set(key, r);
      }
      // Panel only shows actionable requests (must have id)
      list = Array.from(byKey.values()).filter(
        (r) => r.id != null && Number(r.id) > 0 && String(r.status || 'PENDING').toUpperCase() === 'PENDING',
      );

      setPending(list);
    } catch (err) {
      console.error(err);
      setPending(pendingFromRows(attendanceRows));
    } finally {
      setPendingLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    let nextRows = [];
    try {
      if (isEmployee) {
        const { data } = await api.get('/attendance');
        nextRows = Array.isArray(data) ? data : data?.data || [];
      } else {
        try {
          const { data } = await api.get('/attendance', {
            params: { from: shiftDays(date, -14), to: shiftDays(date, 1) },
          });
          nextRows = Array.isArray(data) ? data : data?.data || [];
        } catch {
          const { data } = await api.get('/attendance', { params: { date } });
          nextRows = Array.isArray(data) ? data : data?.data || [];
        }
      }
      setRows(nextRows);
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setLoading(false);
    }
    await loadPending(nextRows);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, user?.role]);

  const checkIn = async () => {
    setBusy(true);
    try {
      await api.post('/attendance/check-in');
      toast.success('Check-in submitted — waiting for HR/Admin approval');
      await load();
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
      toast.success('Check-out submitted — waiting for HR/Admin approval');
      await load();
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setBusy(false);
    }
  };

  const resolveRequestId = (r) => {
    const id = r?.id ?? r?.requestId;
    const n = Number(id);
    if (!id || Number.isNaN(n) || n <= 0) return null;
    return n;
  };

  /** If row has no request id, try to find latest pending request for this attendance */
  const ensureRequestId = async (r) => {
    let id = resolveRequestId(r);
    if (id) return id;
    const attendanceId = r.attendanceId || r.attendance?.id;
    if (!attendanceId) return null;
    try {
      const { data } = await api.get('/attendance/requests', {
        params: { status: 'PENDING' },
      });
      const list = normalizePending(data);
      const match = list.find(
        (x) =>
          (x.attendanceId === attendanceId || x.attendance?.id === attendanceId) &&
          (!r.type || x.type === r.type),
      );
      return resolveRequestId(match);
    } catch {
      return null;
    }
  };

  const approveRequest = async (r) => {
    let requestId = resolveRequestId(r);
    if (!requestId) requestId = await ensureRequestId(r);
    if (!requestId) {
      toast.error(
        'No AttendanceRequest id — backend check-in may not have created a request. Re-check-in after fixing the API, or approve via DB.',
      );
      return;
    }
    try {
      await api.post(`/attendance/requests/${requestId}/approve`);
      toast.success(`Request #${requestId} approved`);
      await load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const rejectRequest = async (r) => {
    let requestId = resolveRequestId(r);
    if (!requestId) requestId = await ensureRequestId(r);
    if (!requestId) {
      toast.error('No AttendanceRequest id found for this row');
      return;
    }
    const rejectedReason = window.prompt('Rejection reason (required)');
    if (rejectedReason == null) return;
    if (!String(rejectedReason).trim()) {
      toast.error('Rejection reason is required');
      return;
    }
    try {
      await api.post(`/attendance/requests/${requestId}/reject`, {
        rejectedReason: String(rejectedReason).trim(),
      });
      toast.success(`Request #${requestId} rejected`);
      await load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const todayYmd = localYmd(new Date());
  const todayRow = isEmployee
    ? rows.find((r) => r.workDate && localYmd(r.workDate) === todayYmd)
    : null;

  const empLabel = (r) => {
    const emp = r.attendance?.employee || r.employee;
    if (!emp) return r.recordedBy?.email || `Request #${r.id}`;
    return `${emp.employeeCode || ''} ${emp.firstName || ''} ${emp.lastName || ''}`.trim();
  };

  const statusBadge = (r) => {
    // Only treat checkout as pending if a checkout time actually exists
    const inPending = r.checkIn && r.checkInStatus === 'PENDING';
    const outPending = r.checkOut && r.checkOutStatus === 'PENDING';
    if (inPending) return { text: 'AWAITING CHECK-IN APPROVAL', cls: 'bg-amber-100 text-amber-900' };
    if (r.checkInStatus === 'REJECTED') return { text: 'CHECK-IN REJECTED', cls: 'bg-red-100 text-red-800' };
    if (outPending) return { text: 'AWAITING CHECK-OUT APPROVAL', cls: 'bg-amber-100 text-amber-900' };
    if (r.checkOut && r.checkOutStatus === 'APPROVED') return { text: 'COMPLETE', cls: 'bg-green-100 text-green-800' };
    if (r.checkInStatus === 'APPROVED') return { text: 'CHECKED IN (APPROVED)', cls: 'bg-blue-100 text-blue-800' };
    if (r.checkOutStatus === 'REJECTED') return { text: 'CHECK-OUT REJECTED', cls: 'bg-red-100 text-red-800' };
    return { text: r.displayStatus || r.status || '—', cls: 'bg-slate-100 text-slate-700' };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
          <p className="text-sm text-slate-500">
            {isEmployee
              ? 'Your check-in / check-out and history'
              : canApprove
                ? 'Team attendance — HR and Admin must approve check-in/out (PENDING is not final)'
                : 'Team attendance'}
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
            {todayRow?.checkInStatus && (
              <span className="ml-2 text-xs text-slate-400">
                check-in: {todayRow.checkInStatus}
              </span>
            )}
          </p>
          {todayRow?.checkInStatus === 'PENDING' && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Check-in time is recorded but <strong>not approved yet</strong>. Wait for HR/Admin.
            </p>
          )}
          {todayRow?.checkInStatus === 'APPROVED' && !todayRow?.checkOut && (
            <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
              Check-in approved. You can check out when you leave.
            </p>
          )}
          {todayRow?.checkInStatus === 'APPROVED' && todayRow?.checkOut && todayRow?.checkOutStatus === 'PENDING' && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Check-out is pending approval.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={
                busy ||
                todayRow?.checkInStatus === 'PENDING' ||
                todayRow?.checkInStatus === 'APPROVED'
              }
              onClick={checkIn}
            >
              {busy ? 'Working…' : 'Check in'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={
                busy ||
                todayRow?.checkInStatus !== 'APPROVED' ||
                todayRow?.checkOutStatus === 'APPROVED' ||
                 (todayRow?.checkOut && todayRow?.checkOutStatus === 'PENDING')
              }
              onClick={checkOut}
            >
              Check out
            </button>
          </div>
        </div>
      )}

      {canApprove && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-amber-900">
              Pending attendance requests
              {pendingLoading ? '…' : ` (${pending.length})`}
            </h2>
            <button type="button" className="btn-secondary text-xs" onClick={() => loadPending(rows)}>
              Refresh
            </button>
          </div>
          <p className="mt-1 text-xs text-amber-800/80">
            A visible check-in time with status <strong>PENDING</strong> is <em>not</em> approved
            yet. Use Approve / Reject below. Endpoint:{' '}
            <code className="text-[10px]">POST /api/attendance/requests/:requestId/approve</code>
          </p>

          {pendingLoading ? (
            <p className="mt-3 text-sm text-amber-900/70">Loading pending…</p>
          ) : pending.length === 0 ? (
            <p className="mt-3 text-sm text-amber-900/70">
              No pending requests found. If the table still shows PENDING, the backend may not have
              created AttendanceRequest rows — fix check-in to call attendanceRequest.create.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {pending.map((r, idx) => {
                const rid = resolveRequestId(r);
                return (
                  <li
                    key={rid || `${r.attendanceId}-${r.type}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2.5 text-sm shadow-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{empLabel(r)}</p>
                      <p className="text-xs text-slate-500">
                        {r.type} · Request ID <strong>{rid ?? 'missing'}</strong>
                        {r.eventTime
                          ? ` · ${new Date(r.eventTime).toLocaleString()}`
                          : ''}
                        {r.attendance?.workDate
                          ? ` · ${new Date(r.attendance.workDate).toLocaleDateString()}`
                          : ''}
                      </p>
                    </div>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        className="btn-primary text-xs"
                        onClick={() => approveRequest(r)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => rejectRequest(r)}
                      >
                        Reject
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
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
                <th className="px-4 py-3">Approval</th>
                {canApprove && <th className="px-4 py-3">Actions</th>}
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
                rows
                  .filter((r) => r.hasAttendance !== false && (r.checkIn || r.id))
                  .map((r) => {
                    const badge = statusBadge(r);
                    const latestInReq = (r.requests || []).find(
                      (x) => x.type === 'CHECK_IN' && String(x.status).toUpperCase() === 'PENDING' && x.id,
                    );
                    const latestOutReq = (r.requests || []).find(
                      (x) => x.type === 'CHECK_OUT' && String(x.status).toUpperCase() === 'PENDING' && x.id,
                    );
                    // Only actionable when a real time exists AND (status pending)
                    const pendingIn =
                      Boolean(r.checkIn) &&
                      r.checkInStatus === 'PENDING' &&
                      (latestInReq || true); // still show if pending; approve will resolve id
                    const pendingOut = Boolean(r.checkOut) && r.checkOutStatus === 'PENDING';
                    return (
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
                            <span
                              className={`ml-1 text-xs ${
                                r.checkInStatus === 'PENDING'
                                  ? 'font-semibold text-amber-600'
                                  : r.checkInStatus === 'APPROVED'
                                    ? 'text-green-600'
                                    : 'text-red-600'
                              }`}
                            >
                              ({r.checkInStatus})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '—'}
                          {r.checkOut && r.checkOutStatus && (
                            <span
                              className={`ml-1 text-xs ${
                                r.checkOutStatus === 'PENDING'
                                  ? 'font-semibold text-amber-600'
                                  : r.checkOutStatus === 'APPROVED'
                                    ? 'text-green-600'
                                    : 'text-red-600'
                              }`}
                            >
                              ({r.checkOutStatus})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge ${badge.cls}`}>{badge.text}</span>
                        </td>
                        {canApprove && (
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {pendingIn && (
                                <>
                                  <button
                                    type="button"
                                    className="btn-primary text-xs px-2 py-1"
                                    onClick={() =>
                                      approveRequest(
                                        latestInReq || {
                                          type: 'CHECK_IN',
                                          attendanceId: r.id,
                                          attendance: r,
                                        },
                                      )
                                    }
                                  >
                                    Approve in
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary text-xs px-2 py-1"
                                    onClick={() =>
                                      rejectRequest(
                                        latestInReq || {
                                          type: 'CHECK_IN',
                                          attendanceId: r.id,
                                          attendance: r,
                                        },
                                      )
                                    }
                                  >
                                    Reject in
                                  </button>
                                </>
                              )}
                              {pendingOut && (
                                <>
                                  <button
                                    type="button"
                                    className="btn-primary text-xs px-2 py-1"
                                    onClick={() =>
                                      approveRequest(
                                        latestOutReq || {
                                          type: 'CHECK_OUT',
                                          attendanceId: r.id,
                                          attendance: r,
                                        },
                                      )
                                    }
                                  >
                                    Approve out
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary text-xs px-2 py-1"
                                    onClick={() =>
                                      rejectRequest(
                                        latestOutReq || {
                                          type: 'CHECK_OUT',
                                          attendanceId: r.id,
                                          attendance: r,
                                        },
                                      )
                                    }
                                  >
                                    Reject out
                                  </button>
                                </>
                              )}
                              {!pendingIn && !pendingOut && (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function shiftDays(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return localYmd(d);
}

/** Local calendar Y-M-D — avoids UTC shift (e.g. Nepal UTC+5:45) */
function localYmd(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    // Prefer the date portion if server sent a date-only midnight in local intent
    const head = value.slice(0, 10);
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      // If UTC date head differs from local date, use local (Nepal midnight stored as prev UTC day)
      return localYmdFromDate(d);
    }
    return head;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return localYmdFromDate(d);
}

function localYmdFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
