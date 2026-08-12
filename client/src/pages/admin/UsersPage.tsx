import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { userService } from '@/api/services/user.service';
import { toRequestError } from '@/api/axiosClient';
import { BoModal } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { clock24, currentShift, shiftStart, whenLast } from '@/utils/date';
import type { Role, User } from '@/types/models';

const roles: Role[] = ['worker', 'supervisor', 'lab', 'manager', 'admin'];

/**
 * The badge beside each name, toned by how far the account reaches rather than
 * by rank: the back office is the pair that can change what the plant records,
 * the floor roles are the tablets, and the lab sits between the two. A manager
 * scanning the list is looking for who holds which door, and the colour says it
 * before the word is read - the word is there too, so the colour is never the
 * only thing carrying it.
 */
const roleTone: Record<Role, string> = {
  worker: 'none',
  supervisor: '',
  lab: '',
  manager: 'hot',
  admin: 'hot',
};

/** The last sign-in, or the plain fact that none has been recorded. */
const lastSeen = (user: User) =>
  user.last_login_at ? `Last signed in ${whenLast(user.last_login_at)}` : 'No sign-in recorded';

/** What each role reaches, shown under the picker so the choice is not a guess. */
const roleNote: Record<Role, string> = {
  worker: 'Shop floor, without Quality.',
  supervisor: 'Shop floor, without Quality.',
  lab: 'Quality only - no machines, batches or dispatch.',
  manager: 'Shop floor and this back office.',
  admin: 'Shop floor and this back office.',
};

/**
 * The form behind both buttons. `id` is what tells them apart: null is a new
 * account, an id is the one being edited. On an edit the PIN box starts empty
 * and blank means "leave it alone" - the server never sends a hash back, so
 * there is nothing to prefill it with and no way to show the current PIN.
 */
type Draft = { id: string | null; name: string; pin: string; role: Role; active: boolean };

const newDraft = (): Draft => ({ id: null, name: '', pin: '', role: 'supervisor', active: true });

const editDraft = (user: User): Draft => ({
  id: user.id,
  name: user.name,
  pin: '',
  role: user.role,
  active: user.active,
});

/** Local state only - user administration is small and does not need a slice. */
export function UsersPage() {
  const notify = useToast();
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const signedIn = useAppSelector((s) => s.auth.user);
  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

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

  /**
   * Who signed in on the shift that is running, most recent first.
   *
   * This is the nearest honest answer to "who is on the floor now", and it is
   * worth being plain about why it is not the exact one: the server hands out a
   * token and keeps no list of who holds one, so nothing anywhere knows who is
   * signed in at this moment. What it does know is when each account last
   * signed in, and an account that signed in since the shift bell is somebody
   * who picked up a tablet this shift.
   *
   * It reads late rather than early - a tablet signed in on Monday and left on
   * the line all week is in use and will not appear here - which is the right
   * way round for a list a manager acts on: a name here was definitely used
   * this shift, rather than probably.
   */
  const onShift = useMemo(() => {
    const since = shiftStart().getTime();
    return rows
      .filter((u) => u.last_login_at && new Date(u.last_login_at).getTime() >= since)
      .sort((a, b) => String(b.last_login_at).localeCompare(String(a.last_login_at)));
  }, [rows]);

  const toggle = async (user: User) => {
    try {
      await userService.update(user.id, { active: !user.active });
      notify(user.active ? 'Account disabled' : 'Account enabled');
      void load();
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    }
  };

  /**
   * One save for both. A new account is a single POST; an edit is up to two
   * calls, because the name and the PIN are deliberately separate routes - the
   * PIN one hashes what it is given, and the other refuses to touch the hash
   * column at all. Only what actually changed is sent: the patch route answers
   * "Nothing to change" to an empty body, which a PIN-only edit would hit.
   */
  const save = async () => {
    if (!draft || saving) return;

    const name = draft.name.trim();
    const pin = draft.pin;
    const creating = draft.id === null;

    if (name.length < 2) {
      notify('A name of at least 2 characters is needed', 'warn');
      return;
    }
    if (creating ? !/^\d{4,6}$/.test(pin) : pin && !/^\d{4,6}$/.test(pin)) {
      notify('A PIN is 4 to 6 digits', 'warn');
      return;
    }

    setSaving(true);
    try {
      if (creating) {
        await userService.create({ name, pin, role: draft.role });
        notify('User created');
      } else {
        const before = rows.find((u) => u.id === draft.id);
        const patch: Partial<User> = {};
        if (name !== before?.name) patch.name = name;
        if (draft.role !== before?.role) patch.role = draft.role;
        if (draft.active !== before?.active) patch.active = draft.active;

        if (!Object.keys(patch).length && !pin) {
          notify('Nothing changed', 'warn');
          return;
        }

        if (Object.keys(patch).length) await userService.update(draft.id!, patch);
        if (pin) await userService.resetPin(draft.id!, pin);

        // The shop floor signs in with this name and this PIN, so a change here
        // is what that tablet has to type from now on - said plainly, because
        // the person whose account it is will not have seen this screen.
        notify(
          draft.id === signedIn?.id
            ? 'Saved. Sign in again with the new details.'
            : `Saved. ${name} signs in on the shop floor with the new details.`,
        );
      }
      setDraft(null);
      void load();
    } catch (err) {
      notify(toRequestError(err).message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const editing = Boolean(draft?.id);

  return (
    <>
      <div className="mx-0.5 mt-3">
        <h1 className="text-lg">Users</h1>
        <div className="sub">
          Who can sign in, and what they reach. Manager and admin also get this back office;
          a lab account gets the Quality tab and nothing else. The time under each name is that
          account's last sign-in, so an account nobody uses says so.
        </div>
      </div>

      {loading && <div className="spin">Loading accounts…</div>}

      {!loading && !rows.length && <div className="empty">No accounts yet.</div>}

      {!loading && Boolean(rows.length) && (
        <>
          <div className="grouphead">
            Signed in this shift · {currentShift()}, since {clock24(shiftStart().toISOString())}
          </div>

          {onShift.length ? (
            onShift.map((user) => (
              <div key={`shift-${user.id}`} className="mrow">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="mn truncate">{user.name}</span>
                    <span className={`badge shrink-0 capitalize ${roleTone[user.role]}`}>
                      {user.role}
                    </span>
                  </div>
                </div>
                <span className="badge ok">{clock24(user.last_login_at)}</span>
              </div>
            ))
          ) : (
            <div className="empty">Nobody has signed in since the shift started.</div>
          )}

          <div className="sub mx-0.5">
            The sign-in itself, not a live session: a tablet signed in days ago and left on the
            line is in use and is not listed here.
          </div>

          <div className="grouphead">All accounts</div>
        </>
      )}

      {!loading &&
        rows.map((user) => (
          <div key={user.id} className="mrow flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="mn truncate">{user.name}</span>
                <span className={`badge shrink-0 capitalize ${roleTone[user.role]}`}>
                  {user.role}
                </span>
              </div>
              <div className="mk mt-1">{lastSeen(user)}</div>
            </div>
            <div className="row gap-2">
              <span className={`badge ${user.active ? 'ok' : 'none'}`}>
                {user.active ? 'active' : 'disabled'}
              </span>
              <button type="button" className="btn ghost" onClick={() => setDraft(editDraft(user))}>
                Edit
              </button>
              <button type="button" className="btn ghost" onClick={() => toggle(user)}>
                {user.active ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        ))}

      <button type="button" className="btn block mt-2.5" onClick={() => setDraft(newDraft())}>
        + Add user
      </button>

      <BoModal
        open={Boolean(draft)}
        title={editing ? 'Edit user' : 'New user'}
        subtitle={
          editing
            ? 'The name and PIN this account signs in with on the shop-floor tablet.'
            : 'The PIN is what they type on the shop-floor tablet.'
        }
        onClose={() => setDraft(null)}
        footer={
          <button type="button" className="btn" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
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
              {editing && <div className="sub mt-1">This is the name typed at sign-in.</div>}
            </div>
            <div className="field">
              <label htmlFor="u-pin">{editing ? 'New PIN' : 'PIN'}</label>
              <input
                id="u-pin"
                inputMode="numeric"
                maxLength={6}
                value={draft.pin}
                onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, '') })}
              />
              {editing && <div className="sub mt-1">Leave blank to keep the current PIN.</div>}
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
            {editing && (
              <div className="field">
                <label htmlFor="u-active">Sign-in</label>
                <select
                  id="u-active"
                  value={draft.active ? 'active' : 'disabled'}
                  onChange={(e) => setDraft({ ...draft, active: e.target.value === 'active' })}
                >
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </select>
              </div>
            )}
          </div>
        )}
      </BoModal>
    </>
  );
}

export default UsersPage;
