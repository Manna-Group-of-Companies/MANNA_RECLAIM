import { useCallback, useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { setSigners, setSupervisor } from '@/features/ui/uiSlice';
import { userService } from '@/api/services/user.service';

/**
 * Read the signing names once per signed-in account, however many sheets ask.
 *
 * A rename in the back office reaches the floor the next time a sheet is
 * opened, which is the granularity this needs - the alternative is every sheet
 * re-reading the account list on mount for a list that changes a few times a
 * year. A failure clears the mark rather than raising anything: the stored list
 * from last time stands, the next sheet tries again, and a tablet on a dropped
 * connection keeps a working pick instead of an error about something the crew
 * did not ask for.
 */
let loadedFor: string | null = null;

/**
 * Who the record is signed by, and how to switch it.
 *
 * The account signed in is the default, because on most shifts it is the same
 * person. It is not the answer though: a tablet is left on the line signed in
 * once, and the supervisor who actually loaded the autoclave or took the
 * bearing temperatures is whoever is holding it. Rather than making the crew
 * sign out and back in to correct a name, the sheets let them switch it.
 *
 * The choice is remembered for the device - see uiSlice's `supervisor`.
 */
export function useSupervisor() {
  const dispatch = useAppDispatch();
  const stored = useAppSelector((s) => s.ui.supervisor);
  const storedFor = useAppSelector((s) => s.ui.supervisorFor);
  const account = useAppSelector((s) => s.auth.user?.name ?? '');
  const signers = useAppSelector((s) => s.ui.signers);
  const authed = useAppSelector((s) => s.auth.status === 'authenticated');

  /*
   * The pick, but only while it is still this account's.
   *
   * It is remembered for the device and a device outlives a session: a name
   * switched last week went on signing everything after it, so the person who
   * signed in this morning found their runs going into History under somebody
   * else's name and no way to tell from the screen that it had happened. A pick
   * whose owner is not the account signed in is ignored, and so is one from
   * before owners were recorded - the account's own name stands until whoever
   * is holding the tablet switches it themselves, which is the state the sheets
   * were always meant to open in.
   */
  const chosen = stored && storedFor && storedFor === account ? stored : null;

  useEffect(() => {
    if (!authed || !account || loadedFor === account) return;
    loadedFor = account;
    void userService
      .signers()
      .then((names) => dispatch(setSigners(names)))
      .catch(() => {
        if (loadedFor === account) loadedFor = null;
      });
  }, [authed, account, dispatch]);

  /** The account first - it is the default - then the plant's supervisors. */
  const options = useMemo(
    () => [...new Set([account, ...signers, chosen ?? ''].filter(Boolean))],
    [account, signers, chosen],
  );

  const name = chosen || account || options[0] || '';

  const setName = useCallback(
    (value: string) => void dispatch(setSupervisor({ name: value, account })),
    [dispatch, account],
  );

  /** True while the name is the account's own, so a sheet can say "you". */
  const isAccount = !chosen || chosen === account;

  return { name, setName, options, account, isAccount };
}

export default useSupervisor;
