import { useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { setSupervisor } from '@/features/ui/uiSlice';
import { SUPERVISORS } from '@/config/constants';

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
  const chosen = useAppSelector((s) => s.ui.supervisor);
  const account = useAppSelector((s) => s.auth.user?.name ?? '');

  /** The account first - it is the default - then the plant's supervisors. */
  const options = useMemo(
    () => [...new Set([account, ...SUPERVISORS, chosen ?? ''].filter(Boolean))],
    [account, chosen],
  );

  const name = chosen || account || options[0] || '';

  const setName = useCallback((value: string) => void dispatch(setSupervisor(value)), [dispatch]);

  /** True while the name is the account's own, so a sheet can say "you". */
  const isAccount = !chosen || chosen === account;

  return { name, setName, options, account, isAccount };
}

export default useSupervisor;
