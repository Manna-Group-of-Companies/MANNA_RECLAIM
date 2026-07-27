import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { login, selectIsAdmin } from '@/features/auth/authSlice';
import { Button } from '@/components/ui';
import { adminPaths } from '@/config/paths';

/** Same credentials as the shop floor, but only manager/admin get through. */
export function AdminLoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error } = useAppSelector((s) => s.auth);
  const isAdmin = useAppSelector(selectIsAdmin);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');

  if (isAdmin) return <Navigate to={adminPaths.dashboard} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await dispatch(login({ name: name.trim(), pin }));
    if (login.fulfilled.match(result)) navigate(adminPaths.dashboard, { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <h1 className="text-center text-xl font-extrabold">Manna Back Office</h1>
      <p className="mb-6 mt-1 text-center text-[13px] text-ink-faint">Manager access only</p>

      <form onSubmit={submit} className="panel space-y-4 p-5">
        <div>
          <label className="label-caps" htmlFor="admin-name">Name</label>
          <input id="admin-name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label-caps" htmlFor="admin-pin">PIN</label>
          <input
            id="admin-pin"
            className="field-input text-center tracking-[8px]"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            required
          />
        </div>
        {error && <p className="text-center text-[13px] text-state-err">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={status === 'loading'}>
          Sign in
        </Button>
      </form>
    </div>
  );
}

export default AdminLoginPage;
