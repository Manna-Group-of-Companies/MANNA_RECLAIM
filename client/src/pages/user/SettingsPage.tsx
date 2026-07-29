import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { logout } from '@/features/auth/authSlice';
import { setSupervisor } from '@/features/ui/uiSlice';
import { Button, SelectField, ViewHead } from '@/components/ui';
import { ADMIN_ROLES, SUPERVISORS } from '@/config/constants';
import { adminPaths, userPaths } from '@/config/paths';
import { appEnv } from '@/config/env';
import { useToast } from '@/hooks/useToast';

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const user = useAppSelector((s) => s.auth.user);
  const online = useAppSelector((s) => s.ui.online);
  const supervisor = useAppSelector((s) => s.ui.supervisor);
  const queued = useAppSelector((s) => s.runs.queue.length);
  const isAdmin = Boolean(user && ADMIN_ROLES.includes(user.role));

  return (
    <>
      <ViewHead title="Settings" meta={<Link to={userPaths.machines}>← back</Link>} />

      <section className="panel mb-3">
        <SelectField
          label="Supervisor on duty"
          hint="Tagged on every run, temperature and verdict logged from this device."
          value={supervisor}
          onChange={(e) => {
            dispatch(setSupervisor(e.target.value));
            notify(e.target.value ? `Supervisor · ${e.target.value}` : 'Supervisor cleared');
          }}
          fieldClassName="!mb-0"
        >
          <option value="">— select —</option>
          {SUPERVISORS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectField>
      </section>

      <section className="panel mb-3">
        <dl className="space-y-2 text-[13px]">
          <div className="flex justify-between">
            <dt className="muted">Signed in as</dt>
            <dd>{user?.name ?? '--'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="muted">Role</dt>
            <dd className="capitalize">{user?.role ?? '--'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="muted">Connection</dt>
            <dd style={{ color: online ? 'var(--ok)' : 'var(--warn)' }}>
              {online ? 'Online' : 'Offline'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="muted">Queued records</dt>
            <dd className="tnum">{queued}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="muted">API</dt>
            <dd className="font-mono text-[11px] text-ink-dim">{appEnv.apiUrl}</dd>
          </div>
        </dl>
      </section>

      {isAdmin && (
        <Link to={adminPaths.dashboard} className="mb-3 block">
          <Button size="lg">Open back office</Button>
        </Link>
      )}

      <Button size="lg" variant="danger" onClick={() => void dispatch(logout())}>
        Sign out
      </Button>
    </>
  );
}

export default SettingsPage;
