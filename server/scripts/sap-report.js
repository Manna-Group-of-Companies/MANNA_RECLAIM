/**
 * What the SAP feeds have actually put on the database, as a page you can open.
 *
 *   npm run sap:report              -> writes sap-report.html and says where
 *   npm run sap:report -- --open    -> and opens it
 *   npm run sap:report -- --json    -> the same figures, machine-readable
 *
 * There is no way to look at this from a browser otherwise. The app's own Stock
 * and Dispatches tabs read it through the API, which needs a sign-in and refuses
 * a page opened off the disk - a `file://` document sends `Origin: null`, and
 * the API's CORS list is the two deployed clients and nothing else. That is
 * correct and worth keeping, so this goes the other way round: the data is read
 * here, with the service key that is already in server/.env, and baked into a
 * self-contained file. No key in the output, no request from the page, nothing
 * to serve it with.
 *
 * Written for the two days either side of a feed going live, when the question
 * is "did anything land" and the answer has to be checkable by somebody who is
 * not going to sign into the app to find out.
 *
 * It reports what is there rather than what should be. A feed that has never run
 * says so in as many words - "nothing has landed" is a different sentence from
 * "the plant shipped nothing", and on a page somebody reads to decide whether an
 * integration works, the two must never look alike.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { crud } from '../src/services/base.service.js';
import { TABLES } from '../src/config/constants.js';

const args = process.argv.slice(2);
const wants = (flag) => args.includes(`--${flag}`);

const syncs = crud(TABLES.sapSyncs, { defaultSort: 'as_of' });
const stock = crud(TABLES.sapStock, { defaultSort: 'sku' });
const dispatches = crud(TABLES.sapDispatches, { defaultSort: 'doc_date' });

const num = (n, places = 0) =>
  n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: places });

/** HTML-escape. Everything on this page came out of another company's ERP. */
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const ago = (iso) => {
  if (!iso) return 'never';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return String(iso);
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
};

/** Per unit, never across - kilograms and pieces are not addable. */
const perUnit = (rows) => {
  const by = new Map();
  for (const r of rows) by.set(r.unit ?? 'kg', (by.get(r.unit ?? 'kg') ?? 0) + Number(r.quantity ?? 0));
  return [...by].map(([unit, qty]) => `${num(qty)} ${unit}`).join(' · ') || '—';
};

const groupBy = (rows, keyOf) => {
  const by = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  return by;
};

async function read(feed, table) {
  const runs = await syncs.all({ feed, status: 'ok' }, { sort: 'as_of' }).catch(() => []);
  const run = runs[0] ?? null;
  if (!run) return { run: null, rows: [] };
  const rows = await table.all({ sync_id: run.id }, { sort: 'created_at' }).catch(() => []);
  return { run, rows };
}

const section = (title, body) => `<section><h2>${esc(title)}</h2>${body}</section>`;

/** A feed that has never run. Said as that, and never as an empty plant. */
const nothingYet = (what) => `
  <p class="none"><b>Nothing has landed yet.</b> The ${esc(what)} sync on the plant
  server has not posted a successful run. That is not the same as ${esc(what)} being
  empty — until it runs once, this page has nothing to show.</p>`;

const feedHead = (run, extra = '') => `
  <p class="when">
    Read from SAP <b>${esc(ago(run.as_of))}</b> <span class="dim">(${esc(run.as_of)})</span>
    · stored ${esc(ago(run.received_at))}
    · ${num(run.rows)} rows${extra}
    <br><span class="dim">sync ${esc(run.id)}</span>
  </p>`;

const table = (headers, rows) => `
  <table>
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;

function stockHtml({ run, rows }) {
  if (!run) return nothingYet('stock');

  const byGrade = groupBy(rows, (r) => r.grade ?? '');
  const blocks = [...byGrade]
    .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])))
    .map(([grade, gradeRows]) => {
      const byBatch = groupBy(gradeRows, (r) => r.batch ?? '');
      const lines = [...byBatch]
        .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : b[0].localeCompare(a[0])))
        .map(([batch, batchRows]) => [
          batch ? `<b>${esc(batch)}</b>` : '<span class="dim">not batch-identified</span>',
          batchRows.map((r) => esc(r.sku)).join('<br>'),
          batchRows.map((r) => esc(r.warehouse ?? '—')).join('<br>'),
          `<b>${perUnit(batchRows)}</b>`,
        ]);
      return `<h3>${esc(grade || 'Not mapped to a grade')} <span class="dim">${perUnit(gradeRows)}</span></h3>
        ${table(['Batch', 'Item', 'Warehouse', 'Quantity'], lines)}`;
    })
    .join('');

  const unmapped = rows.filter((r) => !r.grade).length;
  return `${feedHead(run, ` · <b>${perUnit(rows)}</b>`)}
    ${unmapped ? `<p class="warn">${unmapped} rows carry no grade. They are shown rather than
      hidden — an item nobody has mapped is stock that would otherwise silently not exist. The
      mapping is a table at the top of the sync script on the plant server.</p>` : ''}
    ${blocks}`;
}

function dispatchHtml({ run, rows }) {
  if (!run) return nothingYet('dispatch');

  const valued = rows.filter((r) => r.value != null);
  const currencies = new Set(valued.map((r) => r.currency ?? ''));
  const value =
    valued.length && currencies.size === 1
      ? `${num(valued.reduce((s, r) => s + Number(r.value), 0), 2)} ${[...currencies][0] || ''}`
      : null;

  const docs = groupBy(rows, (r) => `${r.doc_type}|${r.doc_no}`);
  const byGrade = groupBy(rows, (r) => r.grade ?? '');
  const byCustomer = groupBy(rows, (r) => r.customer ?? 'Not named');

  const window = run.window_from
    ? ` · window ${esc(run.window_from)} to ${esc(run.window_to ?? '')}`
    : '';

  const gradeRows = [...byGrade]
    .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])))
    .map(([grade, rs]) => [esc(grade || 'Not mapped'), num(rs.length), `<b>${perUnit(rs)}</b>`]);

  const customerRows = [...byCustomer]
    .sort(
      (a, b) =>
        b[1].reduce((s, r) => s + Number(r.quantity), 0)
        - a[1].reduce((s, r) => s + Number(r.quantity), 0),
    )
    .map(([customer, rs]) => [
      esc(customer),
      num(new Set(rs.map((r) => `${r.doc_type}|${r.doc_no}`)).size),
      `<b>${perUnit(rs)}</b>`,
    ]);

  const docRows = [...docs.values()]
    .sort((a, b) => String(b[0].doc_date ?? '').localeCompare(String(a[0].doc_date ?? '')))
    .map((lines) => {
      const h = lines[0];
      return [
        `<b>${esc(h.doc_no)}</b><br><span class="dim">${esc(h.doc_date ?? '')} · ${esc(h.doc_type ?? '')}</span>`,
        esc(h.customer ?? '—'),
        lines
          .map((l) => `${esc(l.grade ?? l.sku)} <span class="dim">${num(l.quantity)} ${esc(l.unit)}</span>`)
          .join('<br>'),
        `<b>${perUnit(lines)}</b>`,
      ];
    });

  return `${feedHead(run, `${window} · <b>${perUnit(rows)}</b>${value ? ` · ${esc(value)}` : ''}`)}
    ${value == null && rows.length
      ? `<p class="warn">No single value is shown: the lines carry more than one currency, or none
         carry a value. The documents below have what each was worth.</p>`
      : ''}
    <h3>By grade</h3>${table(['Grade', 'Lines', 'Quantity'], gradeRows)}
    <h3>By customer <span class="dim">biggest first</span></h3>
    ${table(['Customer', 'Documents', 'Quantity'], customerRows)}
    <h3>Every document <span class="dim">newest first · ${docRows.length} of them</span></h3>
    ${table(['Document', 'Customer', 'What went', 'Quantity'], docRows)}`;
}

const CSS = `
  :root { color-scheme: light dark; }
  body { font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
         margin: 0 auto; padding: 32px 24px 64px; max-width: 1000px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 36px 0 10px; padding-bottom: 6px;
       border-bottom: 2px solid currentColor; }
  h3 { font-size: 14px; margin: 22px 0 6px; font-weight: 650; }
  .dim { opacity: .6; font-weight: 400; }
  .when { margin: 8px 0 4px; }
  .none, .warn { padding: 12px 14px; border-left: 3px solid currentColor;
                 opacity: .85; margin: 12px 0; }
  .warn { opacity: .95; }
  table { border-collapse: collapse; width: 100%; margin: 6px 0 18px; font-size: 13.5px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid rgba(128,128,128,.25);
           vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; opacity: .65; }
  td:last-child, th:last-child { text-align: right; white-space: nowrap; }
  footer { margin-top: 48px; font-size: 12.5px; opacity: .6; }`;

async function main() {
  const [stockFeed, dispatchFeed] = await Promise.all([
    read('stock', stock),
    read('dispatch', dispatches),
  ]);

  if (wants('json')) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          stock: { run: stockFeed.run, rows: stockFeed.rows.length },
          dispatch: { run: dispatchFeed.run, rows: dispatchFeed.rows.length },
        },
        null,
        2,
      ),
    );
    return;
  }

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MANNA RECLAIM — what SAP has sent</title>
<style>${CSS}</style></head>
<body>
  <h1>What SAP has sent</h1>
  <p class="dim">MANNA RECLAIM · generated ${esc(new Date().toString())}</p>
  ${section('Stock — the yard', stockHtml(stockFeed))}
  ${section('Dispatches — what has gone out', dispatchHtml(dispatchFeed))}
  <footer>
    Read straight from the database, not through the app — so this shows what the feeds
    actually stored rather than what a screen makes of it. Re-run
    <code>npm run sap:report</code> after each sync to refresh. Nothing here is live: the
    figures are as of the moment above.
  </footer>
</body></html>`;

  const out = resolve(process.cwd(), 'sap-report.html');
  writeFileSync(out, html);
  console.log(`Wrote ${out}`);
  console.log(
    `  stock:    ${stockFeed.run ? `${stockFeed.rows.length} rows, read ${ago(stockFeed.run.as_of)}` : 'nothing has landed'}`,
  );
  console.log(
    `  dispatch: ${dispatchFeed.run ? `${dispatchFeed.rows.length} lines, read ${ago(dispatchFeed.run.as_of)}` : 'nothing has landed'}`,
  );

  if (wants('open')) execFile('cmd', ['/c', 'start', '', out], () => {});
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
