import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { logout } from '@/features/auth/authSlice';
import { useRequestLog } from '@/api/requestLog';
import { Button, SheetLabel, ViewHead } from '@/components/ui';
import { ADMIN_ROLES } from '@/config/constants';
import { adminPaths, homeFor, userPaths } from '@/config/paths';
import { appEnv } from '@/config/env';
import { useSupervisor } from '@/hooks/useSupervisor';

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const online = useAppSelector((s) => s.ui.online);
  const queued = useAppSelector((s) => s.runs.queue.length);
  const isAdmin = Boolean(user && ADMIN_ROLES.includes(user.role));
  const { name: signedBy, isAccount } = useSupervisor();
  const log = useRequestLog();

  return (
    <>
      {/* Back to whichever page this account came from - Machines for the
          floor, Quality for the lab. */}
      <ViewHead title="Settings" meta={<Link to={homeFor(user?.role)}>← back</Link>} />

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

      {/*
        Read out, not offered. The pick used to sit on this page so a shift
        could be set up once at the start of it, and what that bought was a
        signature anybody could change from a screen nobody is watching. It is
        asked for on the sheet that signs the record instead - the autoclave
        load, the bearing temperatures - where the name is in front of the
        person putting it on the record. This is only so that somebody who
        wonders whose name is going on can find out without opening a sheet.
      */}
      <section className="panel mb-3">
        <SheetLabel className="!mt-0">Signing</SheetLabel>
        <div className="flex justify-between text-[13px]">
          <span className="muted">Records signed by</span>
          <span>{signedBy || '--'}</span>
        </div>
        <p className="hint mt-2">
          {isAccount
            ? 'Records are signed with the account on this tablet. If somebody else is on the floor, their name is picked on the entry itself.'
            : 'Switched from the account signed in on this tablet. It stays switched until it is changed back on an entry.'}
        </p>
      </section>

      {/*
        The diagnostic log, one tap away. Its own page rather than a list here:
        two hundred lines of it under the sign-out button is not a settings
        screen, and the only person opening it is doing so on purpose.
      */}
      <section className="panel mb-3">
        <SheetLabel className="!mt-0">Diagnostic log</SheetLabel>
        <p className="hint">
          {log.length === 0
            ? 'Nothing recorded yet this session.'
            : `${log.length} calls this session, ${log.failures} of them failed. Open it when something would not save — the server's own reason is in there, and it can be copied out.`}
        </p>
        <Link to={userPaths.log} className="mt-2 block">
          <Button size="lg" variant={log.failures > 0 ? 'danger' : 'ghost'}>
            {log.failures > 0 ? `Open the log · ${log.failures} failed` : 'Open the log'}
          </Button>
        </Link>
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
