import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';

export default function TaxBracketsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/tax-brackets')
      .then(({ data }) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tax Brackets</h1>
        <p className="text-sm text-slate-500">Configurable progressive tax rules</p>
      </div>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
            <tr>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Lower</th>
              <th className="px-4 py-3">Upper</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Fixed</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  No tax brackets
                </td>
              </tr>
            ) : (
              rows.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3 font-medium">{b.label}</td>
                  <td className="px-4 py-3">{Number(b.lowerBound).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {b.upperBound != null ? Number(b.upperBound).toLocaleString() : '∞'}
                  </td>
                  <td className="px-4 py-3">{(Number(b.rate) * 100).toFixed(2)}%</td>
                  <td className="px-4 py-3">{Number(b.fixedTax || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {b.effectiveFrom ? new Date(b.effectiveFrom).toLocaleDateString() : ''}
                  </td>
                  <td className="px-4 py-3">{b.isActive ? 'Yes' : 'No'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
