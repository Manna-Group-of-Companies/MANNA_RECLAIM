import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { logout } from '@/features/auth/authSlice';
import { Button } from '@/components/ui';
import { ADMIN_ROLES } from '@/config/constants';
import { adminPaths } from '@/config/paths';
import { appEnv } from '@/config/env';

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const online = useAppSelector((s) => s.ui.online);
  const queued = useAppSelector((s) => s.runs.queue.length);
  const isAdmin = Boolean(user && ADMIN_ROLES.includes(user.role));

  return (
    <div className="space-y-3">
      <section className="panel p-4">
        <h1 className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-ink-dim">Device</h1>
        <dl className="space-y-2 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-ink-faint">Signed in as</dt>
            <dd>{user?.name ?? '--'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-faint">Role</dt>
            <dd className="capitalize">{user?.role ?? '--'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-faint">Connection</dt>
            <dd className={online ? 'text-state-ok' : 'text-state-warn'}>{online ? 'Online' : 'Offline'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-faint">Queued records</dt>
            <dd className="tnum">{queued}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-faint">API</dt>
            <dd className="font-mono text-[11px] text-ink-dim">{appEnv.apiUrl}</dd>
          </div>
        </dl>
      </section>

      {isAdmin && (
        <Link to={adminPaths.dashboard} className="block">
          <Button size="lg" variant="outline">
            Open back office
          </Button>
        </Link>
      )}

      <Button size="lg" variant="danger" onClick={() => void dispatch(logout())}>
        Sign out
      </Button>
    </div>
  );
}

export default SettingsPage;
