import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/routes';
import { useAppDispatch } from '@/app/hooks';
import { loadSession, sessionExpired } from '@/features/auth/authSlice';
import { tokenStore } from '@/api/axiosClient';

export function App() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (tokenStore.get()) void dispatch(loadSession());

    // raised by the axios interceptor when a refresh finally fails
    const onSignedOut = () => dispatch(sessionExpired());
    window.addEventListener('manna:signed-out', onSignedOut);
    return () => window.removeEventListener('manna:signed-out', onSignedOut);
  }, [dispatch]);

  return <RouterProvider router={router} />;
}

export default App;
