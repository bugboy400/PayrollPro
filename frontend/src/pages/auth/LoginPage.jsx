import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import api, { getError } from '../../api/client';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Redirect to setup if system not initialized
    api
      .get('/setup/status')
      .then(({ data }) => {
        if (!data.initialized) navigate('/setup', { replace: true });
      })
      .catch(() => {})
      .finally(() => setChecking(false));

    // Handle activation/reset token from email link
    const reset = searchParams.get('reset');
    if (reset) {
      navigate(`/reset-password?token=${reset}`, { replace: true });
    }
  }, [navigate, searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(email.trim().toLowerCase(), password);
      toast.success('Welcome back');
      if (data.mustChangePassword || data.user?.mustChangePassword) {
        navigate('/profile?changePassword=1');
      } else {
        navigate('/');
      }
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
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 bg-gradient-to-br from-brand-700 to-brand-900 lg:flex lg:flex-col lg:justify-between p-12 text-white">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-lg font-bold">
              PP
            </div>
            <span className="text-2xl font-semibold">PayrollPro</span>
          </div>
          <h1 className="mt-16 text-4xl font-bold leading-tight">
            Enterprise Payroll,<br />HR & Performance
          </h1>
          <p className="mt-4 max-w-md text-brand-100">
            Secure, scalable workforce management for modern organizations.
          </p>
        </div>
        <p className="text-sm text-brand-200">© {new Date().getFullYear()} PayrollPro</p>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Enter your credentials to continue</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  className="input pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Forgot password?
              </Link>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
