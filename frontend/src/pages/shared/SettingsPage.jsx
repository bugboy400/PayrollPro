import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const [theme, setTheme] = useState('system');
  const [security, setSecurity] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/settings').catch(() => ({ data: { theme: 'system' } })),
      api.get('/settings/security').catch(() => ({ data: null })),
      api.get('/security/history').catch(() => ({ data: [] })),
    ])
      .then(([s, sec, h]) => {
        setTheme(s.data?.theme || 'system');
        setSecurity(sec.data);
        setHistory(Array.isArray(h.data) ? h.data : []);
      })
      .finally(() => setLoading(false));
  }, []);

  const saveTheme = async (value) => {
    setTheme(value);
    try {
      await api.patch('/settings', { theme: value });
      toast.success('Theme saved');
      if (value === 'dark') document.documentElement.classList.add('dark');
      else if (value === 'light') document.documentElement.classList.remove('dark');
      else {
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', dark);
      }
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
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Preferences and security options</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <h2 className="font-semibold">Appearance</h2>
        <label className="label">Theme</label>
        <select className="input" value={theme} onChange={(e) => saveTheme(e.target.value)}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
        <h2 className="font-semibold">Security</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">Account status</dt>
          <dd>{security?.accountStatus === false ? 'Inactive' : 'Active'}</dd>
          <dt className="text-slate-500">Password change</dt>
          <dd>{security?.passwordChange ? 'Available' : '—'}</dd>
          <dt className="text-slate-500">Password reset</dt>
          <dd>{security?.passwordReset ? 'Available' : '—'}</dd>
        </dl>
        <p className="text-sm text-slate-500">
          Change password from <strong>Personal details</strong>. Email: {user?.email}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Recent security events</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No events</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {history.slice(0, 15).map((e) => (
              <li key={e.id} className="flex justify-between py-2 text-sm">
                <span>{e.action}</span>
                <span className="text-xs text-slate-400">
                  {e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
