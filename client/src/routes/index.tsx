import { createBrowserRouter } from 'react-router-dom';
import { LoginPage } from '@/pages/user';
import { AdminLoginPage } from '@/pages/admin';
import { EmptyState } from '@/components/ui';
import { userRoutes } from './userRoutes';
import { adminRoutes } from './adminRoutes';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/admin/login', element: <AdminLoginPage /> },
  ...adminRoutes,
  {
    path: '/',
    children: [
      ...userRoutes,
      { path: '*', element: <EmptyState title="Page not found" hint="Check the address and try again." /> },
    ],
  },
]);

export default router;
