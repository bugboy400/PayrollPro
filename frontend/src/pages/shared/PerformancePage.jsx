import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';

export default function PerformancePage() {
  const [cycles, setCycles] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/performance/cycles').catch(() => ({ data: [] })),
      api.get('/performance/me').catch(() => ({ data: null })),
    ])
      .then(([c, m]) => {
        setCycles(Array.isArray(c.data) ? c.data : []);
        setMe(m.data);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Performance</h1>
        <p className="text-sm text-slate-500">Cycles, goals and reviews</p>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="card">
            <h2 className="font-semibold">Performance cycles</h2>
            {cycles.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No cycles yet</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {cycles.map((c) => (
                  <li key={c.id} className="flex justify-between py-2 text-sm">
                    <span>
                      {c.name} ({c.year})
                    </span>
                    <span className="badge bg-slate-100 dark:bg-slate-800">{c.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {me && (
            <div className="card">
              <h2 className="font-semibold">My performance</h2>
              <p className="mt-2 text-sm text-slate-500">
                Goals: {me.goals?.length ?? 0} · Reviews: {me.reviews?.length ?? 0}
                {me.average != null && ` · Average score: ${me.average}`}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
