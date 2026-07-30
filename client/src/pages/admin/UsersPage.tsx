import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { userService } from '@/api/services/user.service';
import { toRequestError } from '@/api/axiosClient';
import { BoModal } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import type { Role, User } from '@/types/models';

const roles: Role[] = ['worker', 'supervisor', 'lab', 'manager', 'admin'];

/** What each role reaches, shown under the picker so the choice is not a guess. */
const roleNote: Record<Role, string> = {
  worker: 'Shop floor, without Quality.',
  supervisor: 'Shop floor, without Quality.',
  lab: 'Quality only - no machines, batches or dispatch.',
  manager: 'Shop floor and this back office.',
  admin: 'Shop floor and this back office.',
};

/** Local state only - user administration is small and does not need a slice. */
export function UsersPage() {
  const notify = useToast();
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ name: string; pin: string; role: Role } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await userService.list({ limit: 200 })).rows);
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const toggle = async (user: User) => {
    try {
      await userService.update(user.id, { active: !user.active });
      notify(user.active ? 'Account disabled' : 'Account enabled');
      void load();
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    }
  };

  const create = async () => {
    if (!draft) return;
    if (!draft.name.trim() || draft.pin.length < 4) {
      notify('A name and a PIN of at least 4 digits are needed', 'warn');
      return;
    }
    try {
      await userService.create(draft);
      notify('User created');
      setDraft(null);
      void load();
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    }
  };

  return (
    <>
      <div className="mx-0.5 mt-3">
        <h1 className="text-lg">Users</h1>
        <div className="sub">
          Who can sign in, and what they reach. Manager and admin also get this back office;
          a lab account gets the Quality tab and nothing else.
        </div>
      </div>

      {loading && <div className="spin">Loading accounts…</div>}

      {!loading && !rows.length && <div className="empty">No accounts yet.</div>}

      {!loading &&
        rows.map((user) => (
          <div key={user.id} className="mrow">
            <div>
              <div className="mn">{user.name}</div>
              <div className="mk capitalize">{user.role}</div>
            </div>
            <div className="row gap-2">
              <span className={`badge ${user.active ? 'ok' : 'none'}`}>
                {user.active ? 'active' : 'disabled'}
              </span>
              <button type="button" className="btn ghost" onClick={() => toggle(user)}>
                {user.active ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        ))}

      <button
        type="button"
        className="btn block mt-2.5"
        onClick={() => setDraft({ name: '', pin: '', role: 'supervisor' })}
      >
        + Add user
      </button>

      <BoModal
        open={Boolean(draft)}
        title="New user"
        subtitle="The PIN is what they type on the shop-floor tablet."
        onClose={() => setDraft(null)}
        footer={
          <button type="button" className="btn" onClick={create}>
            Create
          </button>
        }
      >
        {draft && (
          <div className="mt-3">
            <div className="field">
              <label htmlFor="u-name">Name</label>
              <input
                id="u-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="u-pin">PIN</label>
              <input
                id="u-pin"
                inputMode="numeric"
                maxLength={6}
                value={draft.pin}
                onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, '') })}
              />
            </div>
            <div className="field">
              <label htmlFor="u-role">Role</label>
              <select
                id="u-role"
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <div className="sub mt-1">{roleNote[draft.role]}</div>
            </div>
          </div>
        )}
      </BoModal>
    </>
  );
}

export default UsersPage;
