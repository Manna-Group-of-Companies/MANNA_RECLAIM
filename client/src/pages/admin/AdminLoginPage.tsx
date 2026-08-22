import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { clearError, login } from '@/features/auth/authSlice';
import { homeFor } from '@/config/paths';

interface SignInProps {
  /** What the form calls itself, under the plant name. */
  subtitle: string;
}

/**
 * One name-and-PIN form, behind two addresses.
 *
 * Where it lands is settled by the role that comes back, not by which address
 * was typed - so a manager who opens /md/login is put on the back office and an
 * MD who opens /admin/login is put on the summary, rather than either being
 * turned away at a guard for having signed in at the wrong door. homeFor is the
 * single answer to "where does this account belong", and the route guards send
 * anyone through the same function when they overreach.
 */
function SignIn({ subtitle }: SignInProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error, user } = useAppSelector((s) => s.auth);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');

  useEffect(() => () => void dispatch(clearError()), [dispatch]);

  // Already signed in - straight to wherever this account lives. Anyone can
  // still sign out and back in as somebody else from here.
  if (status === 'authenticated' && user) return <Navigate to={homeFor(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await dispatch(login({ name: name.trim(), pin }));
    if (login.fulfilled.match(result)) {
      navigate(homeFor(result.payload.user.role), { replace: true });
    }
  };

  return (
    <div className="back-office min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
        <h1 className="text-center">Manna Reports</h1>
        <div className="sub mb-4 text-center">{subtitle}</div>

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

/** Same credentials as the shop floor; the back office is where a manager lands. */
export function AdminLoginPage() {
  return <SignIn subtitle="Manager access" />;
}

/** The managing director's door. Same form, and the role decides the rest. */
export function MdLoginPage() {
  return <SignIn subtitle="Managing director" />;
}

export default AdminLoginPage;
