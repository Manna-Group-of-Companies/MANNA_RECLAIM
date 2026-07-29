import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { clearError, login, selectIsAdmin } from '@/features/auth/authSlice';
import { adminPaths } from '@/config/paths';

/** Same credentials as the shop floor, but only manager/admin get through. */
export function AdminLoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error } = useAppSelector((s) => s.auth);
  const isAdmin = useAppSelector(selectIsAdmin);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');

  useEffect(() => () => void dispatch(clearError()), [dispatch]);

  // Already signed in as a manager - straight through. Anyone else stays on
  // this form, so a supervisor can sign out and back in as a manager here.
  if (isAdmin) return <Navigate to={adminPaths.dashboard} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await dispatch(login({ name: name.trim(), pin }));
    if (login.fulfilled.match(result)) navigate(adminPaths.dashboard, { replace: true });
  };

  return (
    <div className="back-office min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
        <h1 className="text-center">Manna Reports</h1>
        <div className="sub mb-4 text-center">Manager access only</div>

        <form onSubmit={submit} className="panel">
          <div className="field">
            <label htmlFor="admin-name">Name</label>
            <input
              id="admin-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="admin-pin">PIN</label>
            <input
              id="admin-pin"
              className="text-center tracking-[8px]"
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          {error && (
            <div className="errbox" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn block mt-1" disabled={status === 'loading'}>
            {status === 'loading' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminLoginPage;
