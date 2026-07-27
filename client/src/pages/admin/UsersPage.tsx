import { useCallback, useEffect, useState } from 'react';
import { userService } from '@/api/services/user.service';
import { toRequestError } from '@/api/axiosClient';
import { Badge, Button, DataTable, Modal, type Column } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import type { Role, User } from '@/types/models';

const roles: Role[] = ['worker', 'supervisor', 'manager', 'admin'];

/** Local state only - user administration is small and does not need a slice. */
export function UsersPage() {
  const notify = useToast();
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
  }, [load]);

  const columns: Column<User>[] = [
    { key: 'name', header: 'Name', render: (u) => <span className="font-semibold">{u.name}</span> },
    { key: 'role', header: 'Role', render: (u) => <span className="capitalize">{u.role}</span> },
    {
      key: 'active',
      header: 'State',
      render: (u) => <Badge tone={u.active ? 'ok' : 'neutral'}>{u.active ? 'active' : 'disabled'}</Badge>,
    },
    {
      key: 'toggle',
      header: '',
      align: 'right',
      render: (u) => (
        <Button
          size="sm"
          onClick={async () => {
            try {
              await userService.update(u.id, { active: !u.active });
              notify(u.active ? 'Account disabled' : 'Account enabled');
              void load();
            } catch (err) {
              notify(toRequestError(err).message, 'err');
            }
          }}
        >
          {u.active ? 'Disable' : 'Enable'}
        </Button>
      ),
    },
  ];

  const create = async () => {
    if (!draft) return;
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
    <section className="panel p-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-ink-dim">Users</h1>
        <Button variant="primary" size="sm" onClick={() => setDraft({ name: '', pin: '', role: 'supervisor' })}>
          Add user
        </Button>
      </header>

      <DataTable columns={columns} rows={rows} rowKey={(u) => u.id} loading={loading} empty="No accounts yet" />

      <Modal
        open={Boolean(draft)}
        title="New user"
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={create}>
              Create
            </Button>
          </>
        }
      >
        {draft && (
          <>
            <div>
              <label className="label-caps" htmlFor="u-name">Name</label>
              <input
                id="u-name"
                className="field-input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label-caps" htmlFor="u-pin">PIN</label>
              <input
                id="u-pin"
                className="field-input tnum"
                inputMode="numeric"
                maxLength={6}
                value={draft.pin}
                onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, '') })}
              />
            </div>
            <div>
              <label className="label-caps" htmlFor="u-role">Role</label>
              <select
                id="u-role"
                className="field-input"
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}

export default UsersPage;
