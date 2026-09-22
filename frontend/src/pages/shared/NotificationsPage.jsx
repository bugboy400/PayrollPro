import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';

export default function NotificationsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api
      .get('/notifications')
      .then(({ data }) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setRows((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch (err) {
      toast.error(getError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-slate-500">System and security alerts</p>
      </div>

      <div className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
        {loading ? (
          <p className="p-6 text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-slate-400">No notifications</p>
        ) : (
          rows.map((n) => (
            <div
              key={n.id}
              className={`flex items-start justify-between gap-4 px-5 py-4 ${
                !n.isRead ? 'bg-brand-50/50 dark:bg-brand-950/20' : ''
              }`}
            >
              <div>
                <p className="font-medium">{n.title}</p>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{n.message}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''} · {n.type}
                </p>
              </div>
              {!n.isRead && (
                <button className="btn-ghost text-xs shrink-0" onClick={() => markRead(n.id)}>
                  Mark read
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
