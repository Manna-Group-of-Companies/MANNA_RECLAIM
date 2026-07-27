import { useCallback } from 'react';
import { useAppDispatch } from '@/app/hooks';
import { toast, type ToastKind } from '@/features/ui/uiSlice';

/** `const notify = useToast(); notify('Run started')` */
export function useToast() {
  const dispatch = useAppDispatch();
  return useCallback(
    (message: string, kind: ToastKind = 'ok') => dispatch(toast(message, kind)),
    [dispatch],
  );
}

export default useToast;
