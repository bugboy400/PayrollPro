import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import api, { getError } from '../../api/client';

export default function ProfilePage() {
  const { user, loadMe } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const name = user?.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`
    : user?.email;

  const changePassword = async (e) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error('New passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      toast.success('Password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
      await loadMe();
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Personal details</h1>
        <p className="text-sm text-slate-500">Your profile information and password</p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Account</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">Name</dt>
          <dd>{name}</dd>
          <dt className="text-slate-500">Email</dt>
          <dd>{user?.email}</dd>
          <dt className="text-slate-500">Role</dt>
          <dd>{user?.role?.replace('_', ' ')}</dd>
          {user?.employee?.employeeCode && (
            <>
              <dt className="text-slate-500">Employee ID</dt>
              <dd className="font-mono">{user.employee.employeeCode}</dd>
            </>
          )}
        </dl>
      </div>

      <form onSubmit={changePassword} className="card space-y-4">
        <h2 className="font-semibold">Change password</h2>
        <div>
          <label className="label">Current password</label>
          <input
            type="password"
            className="input"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">New password</label>
          <input
            type="password"
            className="input"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
