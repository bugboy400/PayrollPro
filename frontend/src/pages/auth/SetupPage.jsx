import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';

export default function SetupPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({
    companyName: '',
    legalName: '',
    email: '',
    password: '',
    confirmPassword: '',
    address: '',
    phone: '',
    website: '',
    pan: '',
    vat: '',
    registrationNumber: '',
  });

  useEffect(() => {
    api
      .get('/setup/status')
      .then(({ data }) => {
        if (data.initialized) {
          toast('System already initialized');
          navigate('/login', { replace: true });
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [navigate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await api.post('/setup', {
        companyName: form.companyName,
        legalName: form.legalName || form.companyName,
        email: form.email.trim().toLowerCase(),
        password: form.password,
        address: form.address || undefined,
        phone: form.phone || undefined,
        website: form.website || undefined,
        pan: form.pan || undefined,
        vat: form.vat || undefined,
        registrationNumber: form.registrationNumber || undefined,
      });
      toast.success('PayrollPro initialized successfully. Please sign in.');
      navigate('/login');
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
            PP
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Initialize PayrollPro</h1>
          <p className="mt-2 text-slate-500">
            Create the first administrator and company profile. This can only be done once.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Company</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Company Name *</label>
                <input className="input" value={form.companyName} onChange={set('companyName')} required />
              </div>
              <div>
                <label className="label">Legal Name</label>
                <input className="input" value={form.legalName} onChange={set('legalName')} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={set('phone')} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Address</label>
                <input className="input" value={form.address} onChange={set('address')} />
              </div>
              <div>
                <label className="label">Website</label>
                <input className="input" value={form.website} onChange={set('website')} />
              </div>
              <div>
                <label className="label">PAN</label>
                <input className="input" value={form.pan} onChange={set('pan')} />
              </div>
              <div>
                <label className="label">VAT</label>
                <input className="input" value={form.vat} onChange={set('vat')} />
              </div>
              <div>
                <label className="label">Registration Number</label>
                <input className="input" value={form.registrationNumber} onChange={set('registrationNumber')} />
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold">First Administrator</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Email *</label>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={set('email')}
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label">Password *</label>
                <input
                  type="password"
                  className="input"
                  value={form.password}
                  onChange={set('password')}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="label">Confirm Password *</label>
                <input
                  type="password"
                  className="input"
                  value={form.confirmPassword}
                  onChange={set('confirmPassword')}
                  required
                  minLength={8}
                />
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? 'Initializing…' : 'Initialize System'}
          </button>
        </form>
      </div>
    </div>
  );
}
