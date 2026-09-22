import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Printer, Download, X } from 'lucide-react';
import api, { getError } from '../../api/client';
import PayslipDocument from '../../components/PayslipDocument';

export default function PayslipsPage() {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [records, setRecords] = useState([]);
  const [slip, setSlip] = useState(null);
  const [company, setCompany] = useState(null);
  const printRef = useRef(null);

  useEffect(() => {
    api
      .get('/payroll')
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setPeriods(list);
      })
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
    api.get('/company').then(({ data }) => setCompany(data)).catch(() => {});
  }, []);

  const openPeriod = async (p) => {
    setSelected(p);
    setSlip(null);
    if (p.records?.length) {
      setRecords(p.records);
      return;
    }
    try {
      const { data } = await api.get('/payroll', { params: { year: p.year, month: p.month } });
      const list = Array.isArray(data) ? data : data.data || [];
      const match = list.find((x) => x.id === p.id) || p;
      setRecords(match.records || []);
    } catch {
      setRecords([]);
    }
  };

  const openSlip = async (r) => {
    const id = r.payslip?.id || r.payslipId;
    try {
      if (id) {
        const { data } = await api.get(`/payslips/${id}`);
        setSlip(data);
        return;
      }
      // Fallback: shape a payslip-like object from the payroll record
      setSlip({
        id: r.id,
        payrollRecord: r,
      });
    } catch (err) {
      toast.error(getError(err));
      setSlip({ id: r.id, payrollRecord: r });
    }
  };

  const printSlip = () => {
    const node = printRef.current;
    if (!node) {
      toast.error('Nothing to print');
      return;
    }

    // Hidden iframe avoids popup blockers
    const existing = document.getElementById('payslip-print-frame');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'payslip-print-frame';
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      toast.error('Could not open print view');
      return;
    }

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><title>Payslip</title>
      <style>
        @page { size: A4; margin: 12mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
          color: #1e293b;
          background: #fff;
        }
        .payslip-sheet { max-width: 100%; box-shadow: none !important; border-radius: 0 !important; }
        .bg-slate-900 { background: #0f172a !important; color: #fff !important; }
        .bg-slate-50 { background: #f8fafc !important; }
        .bg-brand-600, .from-brand-600\\/30 { background: #2563eb !important; }
        .text-white { color: #fff !important; }
        .text-brand-300, .text-brand-700 { color: #60a5fa !important; }
        .text-slate-300, .text-slate-400, .text-slate-500 { color: #64748b !important; }
        .text-slate-800, .text-slate-900 { color: #1e293b !important; }
        .border-slate-100, .border-slate-50 { border-color: #f1f5f9 !important; }
        .border-b { border-bottom: 1px solid #f1f5f9; }
        .border-r { border-right: 1px solid #f1f5f9; }
        .grid { display: grid; }
        .grid-cols-2 { grid-template-columns: 1fr 1fr; }
        .flex { display: flex; }
        .items-start, .items-center { align-items: center; }
        .justify-between { justify-content: space-between; }
        .gap-3, .gap-6 { gap: 0.75rem; }
        .gap-x-8 { column-gap: 2rem; }
        .gap-y-3 { row-gap: 0.75rem; }
        .px-8 { padding-left: 2rem; padding-right: 2rem; }
        .py-4, .py-5 { padding-top: 1rem; padding-bottom: 1rem; }
        .pt-7, .pb-6 { padding-top: 1.5rem; padding-bottom: 1.25rem; }
        .pt-3 { padding-top: 0.75rem; }
        .py-1\\.5 { padding-top: 0.35rem; padding-bottom: 0.35rem; }
        .mt-0\\.5, .mt-1 { margin-top: 0.25rem; }
        .mb-3 { margin-bottom: 0.75rem; }
        .w-full { width: 100%; }
        .text-right { text-align: right; }
        .text-xs, .text-\\[10px\\], .text-\\[11px\\] { font-size: 10px; }
        .text-sm { font-size: 13px; }
        .text-lg { font-size: 17px; }
        .text-xl { font-size: 20px; }
        .text-3xl { font-size: 28px; font-weight: 600; }
        .font-medium { font-weight: 500; }
        .font-semibold, .font-bold { font-weight: 600; }
        .uppercase { text-transform: uppercase; }
        .tracking-tight { letter-spacing: -0.02em; }
        .tracking-wider, .tracking-\\[0\\.18em\\], .tracking-\\[0\\.2em\\], .tracking-\\[0\\.22em\\] { letter-spacing: 0.12em; }
        .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        table { border-collapse: collapse; width: 100%; }
        header, section, footer, article { display: block; }
        .rounded-lg { border-radius: 0.5rem; }
        .h-11 { height: 2.75rem; width: 2.75rem; }
        .flex.h-11 { display: flex; align-items: center; justify-content: center; }
      </style>
    </head><body>${node.innerHTML}</body></html>`);
    doc.close();

    const runPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        toast.error('Print failed — try API PDF or allow this site to print');
      }
      setTimeout(() => iframe.remove(), 1000);
    };

    // Give the iframe a moment to parse HTML
    setTimeout(runPrint, 250);
  };

  const downloadBackendPdf = async () => {
    const id = slip?.id || slip?.payrollRecord?.payslip?.id;
    if (!id) {
      toast.error('No payslip id — use Print for the designed slip');
      return;
    }
    try {
      const res = await api.get(`/payslips/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getError(err) || 'Could not download PDF');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payslips</h1>
        <p className="text-sm text-slate-500">
          Open a period, then view a formatted payslip. Use Print for the elegant layout.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 font-semibold">Periods</div>
            {loading ? (
              <p className="p-6 text-slate-400">Loading…</p>
            ) : periods.length === 0 ? (
              <p className="p-6 text-slate-400">No payroll periods yet</p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {periods.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50 ${
                        selected?.id === p.id ? 'bg-brand-50' : ''
                      }`}
                      onClick={() => openPeriod(p)}
                    >
                      <span className="font-medium">
                        {p.year}-{String(p.month).padStart(2, '0')}
                      </span>
                      <span className="badge bg-slate-100 text-slate-700">{p.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 font-semibold">
              {selected
                ? `Employees · ${selected.year}-${String(selected.month).padStart(2, '0')}`
                : 'Select a period'}
            </div>
            {!selected ? (
              <p className="p-6 text-slate-400">Choose a period</p>
            ) : records.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">
                No records in this response. Process payroll first, or the API did not include
                nested records.
              </p>
            ) : (
              <ul className="max-h-[360px] divide-y divide-slate-50 overflow-y-auto">
                {records.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50"
                      onClick={() => openSlip(r)}
                    >
                      <div>
                        <p className="font-medium">
                          {r.employee?.firstName} {r.employee?.lastName}
                        </p>
                        <p className="font-mono text-xs text-brand-600">{r.employee?.employeeCode}</p>
                      </div>
                      <span className="tabular-nums text-slate-700">
                        {Number(r.net || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          {!slip ? (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-sm text-slate-400">
              Select an employee to preview the payslip
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-primary" onClick={printSlip}>
                  <Printer className="h-4 w-4" />
                  Print / Save PDF
                </button>
                <button type="button" className="btn-secondary" onClick={downloadBackendPdf}>
                  <Download className="h-4 w-4" />
                  API PDF
                </button>
                <button type="button" className="btn-ghost" onClick={() => setSlip(null)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div ref={printRef} className="bg-slate-100 p-4">
                <PayslipDocument data={slip} company={company} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
