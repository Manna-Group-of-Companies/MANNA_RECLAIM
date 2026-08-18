import { Link } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import {
  entryFailed,
  entryUnreachable,
  requestLog,
  useRequestLog,
  type LogEntry,
} from '@/api/requestLog';
import { Button, EmptyState, ViewHead } from '@/components/ui';
import { icons } from '@/config/icons';
import { appEnv } from '@/config/env';
import { userPaths } from '@/config/paths';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';

/**
 * Puts text on the clipboard, on a tablet as well as on a desk machine.
 *
 * `navigator.clipboard` needs a secure context, and the floor tablets reach the
 * plant's own address over plain http. Falling back to a throwaway textarea and
 * `execCommand` is deprecated everywhere and still the only thing that works
 * there - a Copy button that silently does nothing is worse than a deprecated
 * call.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Falls through to the textarea below.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

const two = (n: number) => String(n).padStart(2, '0');

const clockWithSeconds = (at: Date) =>
  `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`;

/**
 * What the app has asked the server for, and what came back.
 *
 * This screen exists because of where these tablets end up. On a plant floor
 * nobody has devtools open, so "it would not save" arrives with nothing behind
 * it - and the answer is nearly always a refusal the server already explained
 * in words, which went past in a toast while somebody's hands were full.
 *
 * So the failures are what this leads on. The list is every call, but a failed
 * one carries the server's own sentence under it, and Copy puts the lot on the
 * clipboard with a header saying which API and which account. That is a message
 * a supervisor can send from the floor and somebody can act on.
 *
 * Ported from the Supervisor app's Settings → Diagnostic log, which is the one
 * screen that app had and this one did not.
 */
export function LogPage() {
  const { entries, length, failures } = useRequestLog();
  const user = useAppSelector((s) => s.auth.user);
  const notify = useToast();

  const onCopy = async () => {
    const ok = await copyText(requestLog.asText({ account: user?.name, role: user?.role }));
    notify(ok ? `${length} calls copied` : 'Could not reach the clipboard', ok ? 'ok' : 'err');
  };

  return (
    <>
      <ViewHead
        title="Diagnostic log"
        meta={<Link to={userPaths.settings}>← settings</Link>}
      />

      <section className="panel mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill">{length} calls</span>
          <span className={cn('pill', failures > 0 ? 'down' : 'ok')}>{failures} failed</span>
        </div>
        <div className="mt-2 break-all font-mono text-[11px] text-ink-faint">{appEnv.apiUrl}</div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => void onCopy()} disabled={length === 0}>
            Copy the whole log
          </Button>
          <Button size="sm" variant="danger" onClick={() => requestLog.clear()} disabled={length === 0}>
            Clear
          </Button>
        </div>
      </section>

      {entries.length === 0 ? (
        <EmptyState
          icon={icons.log}
          title="Nothing recorded yet"
          hint="Every call this app makes to the server lands here as it happens, newest first. It is kept in memory only — reloading the page clears it."
        />
      ) : (
        <ul className="stack">
          {entries.map((entry) => (
            <Row key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </>
  );
}

function Row({ entry }: { entry: LogEntry }) {
  const failed = entryFailed(entry);
  // Unreachable is amber rather than red on purpose: nothing was refused, the
  // call never landed. On a plant connection that is a normal thing to see, and
  // colouring it like a rejection would train the crew to ignore both.
  const colour = entryUnreachable(entry)
    ? 'var(--warn)'
    : failed
      ? 'var(--err)'
      : 'var(--ok)';

  return (
    <li
      className={cn('rounded-[var(--r-sm)] border px-3 py-2.5')}
      style={{
        background: failed ? 'var(--sunken)' : 'transparent',
        borderColor: failed ? 'var(--line2)' : 'var(--rule)',
      }}
    >
      <div className="flex items-start gap-2">
        <span className="tnum w-10 shrink-0 text-[11px] font-extrabold" style={{ color: colour }}>
          {entry.status ?? 'ERR'}
        </span>
        <span className="w-12 shrink-0 text-[10.5px] font-bold text-ink-faint">{entry.method}</span>
        <span className="min-w-0 flex-1 break-all font-mono text-[11.5px]">{entry.path}</span>
        <span className="tnum shrink-0 text-[10.5px] text-ink-faint">
          {clockWithSeconds(entry.at)} · {entry.millis}ms
        </span>
      </div>

      {/* The server's own sentence, where there was one. This is the part worth
          reading: it names the group, the tab or the document the work is on. */}
      {entry.message && (
        <div className="ml-12 mt-1.5 text-[11.5px] leading-snug" style={{ color: colour }}>
          {entry.message}
        </div>
      )}
      {entry.note && (
        <div className="ml-12 mt-1 text-[10.5px] text-ink-faint">{entry.note}</div>
      )}
    </li>
  );
}

export default LogPage;
