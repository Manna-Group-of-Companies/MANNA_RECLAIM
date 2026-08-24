import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { userService } from '@/api/services/user.service';
import { OperatorRoll } from '@/features/operators/OperatorRoll';
import { toRequestError } from '@/api/axiosClient';
import { BoModal } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { clock24, whenLast } from '@/utils/date';
import { minsAgo, onAppNow } from '@/utils/presence';
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
  // Toned with the tablets rather than with the back office, because the tone
  // is how far an account reaches and this one reaches two screens read-only.
  // It is the least far-reaching account in the app, whatever the job title.
  md: 'none',
};

/**
 * How recently an account has to have done something to count as being on the
 * app. Comfortably wider than the server's stamping interval, so somebody
 * working steadily never blinks out of the list between two of their own
 * writes - see SEEN_EVERY_MS in the API.
 */
/**
 * The two dates on an account, said plainly. They answer different questions
 * and a floor whose phones stay signed in for a month can show a long gap
 * between them: last used is when this account last did anything, last signed
 * in is when somebody last actually typed the name and the PIN.
 */
const activity = (user: User) => {
  const used = user.last_seen_at ? `Last used ${whenLast(user.last_seen_at)}` : 'Never used';
  const login = user.last_login_at
    ? `signed in ${whenLast(user.last_login_at)}`
    : 'no sign-in recorded';
  return `${used} · ${login}`;
};

/**
 * What each role reaches, shown under the picker so the choice is not a guess.
 *
 * Admin used to read word for word the same as manager, which made the one
 * difference that matters invisible at the moment somebody picks between them.
 * The two reach the same screens; what only admin can do is destroy - clearing a
 * weighing, clearing an emptied stock group, taking a lab verdict off the
 * record. See DELETE_ROLES in config/constants.
 */
const roleNote: Record<Role, string> = {
  worker: 'Shop floor, without Quality.',
  supervisor: 'Shop floor, without Quality.',
  lab: 'Quality only - no machines, batches or dispatch.',
  manager: 'Shop floor and this back office. Can correct anything; cannot delete.',
  admin: 'Everything a manager reaches, plus the deletes nobody can undo - clearing a weighing, clearing a stock group, removing a QC verdict.',
  md: 'The plant overview and the shift efficiency, read-only. No shop floor, no rate card, no ideal values, and no way to write anything anywhere.',
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

  // The block at the top is a "right now" answer, so it has to keep up on a
  // screen left open. A minute is well inside the fifteen the window allows.
  useRefreshOnFocus(load, { intervalMs: 60_000 });

  /**
   * Which supervisor is on the app, most recently present first - the same
   * answer, off the same rules, that the nav bar above is showing. Both read
   * utils/presence, because a floor where those two screens disagreed about who
   * is working would be worse than either of them alone.
   */
  const onApp = useMemo(() => onAppNow(rows), [rows]);

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
          Which supervisor is on the app and when, then everyone who can sign in and what they
          reach, then the operators who run the lines. The difference between the last two is a
          login: an operator does not sign into anything, so the roll is names and nothing else.
        </div>
      </div>

      {loading && <div className="spin">Loading accounts…</div>}

      {!loading && !rows.length && <div className="empty">No accounts yet.</div>}

      {!loading && Boolean(rows.length) && (
        <>
          <div className="grouphead">On the supervisor app · last 15 minutes</div>

          {onApp.length ? (
            onApp.map(({ user, at }) => (
              <div key={`on-app-${user.id}`} className="mrow">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="mn truncate">{user.name}</span>
                    <span className={`badge shrink-0 capitalize ${roleTone[user.role]}`}>
                      {user.role}
                    </span>
                  </div>
                  <div className="mk mt-1">
                    {user.last_login_at
                      ? `Signed in ${whenLast(user.last_login_at)}`
                      : 'Signed in before this was recorded'}
                  </div>
                </div>
                <div className="text-right">
                  <span className="badge ok">{clock24(new Date(at).toISOString())}</span>
                  <div className="mk mt-1">{minsAgo(at)}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">No supervisor has used the app in the last 15 minutes.</div>
          )}

          <div className="sub mx-0.5">
            The floor only - a manager reading this page is not on the app, so the back office
            does not list itself here. It is recent use rather than a live session: a phone in
            somebody's pocket with the screen off stops counting after fifteen minutes.
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
              <div className="mk mt-1">{activity(user)}</div>
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

      <OperatorRoll />

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
