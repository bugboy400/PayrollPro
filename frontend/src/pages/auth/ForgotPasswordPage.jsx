import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSent(true);
      toast.success('If an account exists, a reset link has been sent.');
    } catch (err) {
      // Backend should not reveal existence; still show generic success
      setSent(true);
      toast.success('If an account exists, a reset link has been sent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md card">
        <h1 className="text-xl font-bold">Forgot password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter your email and we will send a secure reset link if an account exists.
        </p>

        {sent ? (
          <div className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-200">
            Check your email for the password reset link. It expires shortly.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm">
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
