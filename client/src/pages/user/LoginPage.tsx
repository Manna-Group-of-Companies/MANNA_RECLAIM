import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { clearError, login } from '@/features/auth/authSlice';
import { Button } from '@/components/ui';
import { homeFor } from '@/config/paths';
import { appEnv } from '@/config/env';

/** Name + PIN gate, same idea as the login overlay in the prototype. */
export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error, user } = useAppSelector((s) => s.auth);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');

  useEffect(() => () => void dispatch(clearError()), [dispatch]);

  // Where they land is their role's own home: the lab has no Machines tab, and
  // sending it there would only be turned around by the guard on that page.
  if (status === 'authenticated') return <Navigate to={homeFor(user?.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await dispatch(login({ name: name.trim(), pin }));
    if (login.fulfilled.match(result)) {
      navigate(homeFor(result.payload.user.role), { replace: true });
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-5 py-10">
      <h1 className="text-center text-xl font-extrabold">{appEnv.appName}</h1>
      <p className="mb-6 mt-1 text-center text-[13px] text-ink-faint">Sign in with your name and PIN</p>

      <form onSubmit={submit} className="panel space-y-4 p-5">
        <div>
          <label className="label-caps" htmlFor="name">Name</label>
          <input
            id="name"
            className="field-input"
            autoComplete="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label-caps" htmlFor="pin">PIN</label>
          <input
            id="pin"
            className="field-input tracking-[8px] text-center"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
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

export default LoginPage;
