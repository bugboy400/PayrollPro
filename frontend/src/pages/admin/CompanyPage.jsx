import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';

export default function CompanyPage() {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/company')
      .then(({ data }) => setForm(data || {}))
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch('/company', form);
      setForm(data);
      toast.success('Company profile updated');
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setSaving(false);
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Company Profile</h1>
        <p className="text-sm text-slate-500">Used on payslips, reports and branding</p>
      </div>

      <form onSubmit={save} className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['companyName', 'Company Name'],
            ['legalName', 'Legal Name'],
            ['email', 'Email'],
            ['phone', 'Phone'],
            ['website', 'Website'],
            ['pan', 'PAN'],
            ['vat', 'VAT'],
            ['registrationNumber', 'Registration Number'],
            ['currency', 'Currency'],
            ['timezone', 'Timezone'],
            ['fiscalYear', 'Fiscal Year'],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input className="input" value={form[key] || ''} onChange={set(key)} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <input className="input" value={form.address || ''} onChange={set('address')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Payslip Footer</label>
            <textarea className="input" value={form.payslipFooter || ''} onChange={set('payslipFooter')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Payslip Signature</label>
            <input className="input" value={form.payslipSignature || ''} onChange={set('payslipSignature')} />
          </div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <div className="card space-y-3">
        <h2 className="font-semibold">Company logo</h2>
        {form.logoUrl && (
          <img src={form.logoUrl} alt="Logo" className="h-16 object-contain" />
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.append('logo', file);
            try {
              const { data } = await api.post('/company/logo', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
              setForm((f) => ({ ...f, logoUrl: data.logoUrl }));
              toast.success('Logo uploaded');
            } catch (err) {
              toast.error(getError(err));
            }
          }}
        />
      </div>
    </div>
  );
}
