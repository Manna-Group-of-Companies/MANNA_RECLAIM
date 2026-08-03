/**
 * Telling "the database refused this" apart from "the database has never heard
 * of it".
 *
 * The two look alike from here - both arrive as a failed RPC - and they call for
 * opposite responses. A refusal is the function doing its job and has to reach
 * the screen; a missing function is a project that has not run the migration
 * that adds it, and the call can often be made again in the older shape so the
 * work still gets recorded.
 *
 * That distinction is made in more than one service now - a dispatch posted
 * without its loading entry, a packing filed without its unit - so the test
 * lives here rather than being written out twice and drifting.
 *
 * PGRST202 is PostgREST's "no matching function in the schema cache"; 42883 is
 * Postgres' own "function does not exist". The message check catches a PostgREST
 * old enough not to have sent a code.
 */
export const noSuchFunction = (err) =>
  err?.pgCode === 'PGRST202' ||
  err?.pgCode === '42883' ||
  /Could not find the function/i.test(String(err?.message ?? ''));

export default { noSuchFunction };
