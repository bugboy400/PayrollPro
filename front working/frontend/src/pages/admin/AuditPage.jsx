import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';

export default function AuditPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/audit')
      .then(({ data }) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-slate-500">Append-only system records (role-scoped)</p>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    No audit records
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                    </td>
                    <td className="px-4 py-3">
                      {r.user?.email || '—'}
                      <span className="block text-xs text-slate-400">{r.user?.role}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">{r.action}</td>
                    <td className="px-4 py-3">{r.entity}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.entityId || '—'}</td>
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
