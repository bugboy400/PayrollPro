import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';

export default function PayslipsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Payslips are usually accessed via payroll records; try common endpoints
    api
      .get('/payroll')
      .then(({ data }) => {
        const periods = Array.isArray(data) ? data : data.data || [];
        setRows(periods);
      })
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  }, []);

  const downloadPdf = async (id) => {
    try {
      const res = await api.get(`/payslips/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payslips</h1>
        <p className="text-sm text-slate-500">View and download payslip PDFs</p>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-400">No payslip periods available yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <span className="font-medium">
                  {p.year}-{String(p.month).padStart(2, '0')} · {p.status}
                </span>
                <span className="text-sm text-slate-500">
                  Open a payroll record to download individual payslips via /api/payslips/:id/pdf
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
