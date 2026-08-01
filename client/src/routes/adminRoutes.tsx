import { Navigate, type RouteObject } from 'react-router-dom';
import { AdminLayout } from '@/components/layout';
import { ProtectedRoute } from './ProtectedRoute';
import {
  AdminHistoryPage,
  AdminMachinesPage,
  AdminQualityPage,
  BearingsPage,
  CostingPage,
  CustomerDetailPage,
  CustomersPage,
  DashboardPage,
  EfficiencyPage,
  MaintenancePage,
  ProductsPage,
  RatesPage,
  UsersPage,
} from '@/pages/admin';
import { adminPaths } from '@/config/paths';

/** Back-office routes - the back.html side of the app. */
export const adminRoutes: RouteObject[] = [
  {
    path: 'admin',
    element: <ProtectedRoute redirectTo={adminPaths.login} adminOnly />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to={adminPaths.dashboard} replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'history', element: <AdminHistoryPage /> },
          { path: 'quality', element: <AdminQualityPage /> },
          { path: 'efficiency', element: <EfficiencyPage /> },
          { path: 'rates', element: <RatesPage /> },
          { path: 'costing', element: <CostingPage /> },
          { path: 'maintenance', element: <MaintenancePage /> },
          { path: 'bearings', element: <BearingsPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'machines', element: <AdminMachinesPage /> },
          // Who the plant sells to, and what has gone out to them. Inside the
          // admin guard, which is manager and admin - a supervisor typing the
          // address is turned away here and refused by the API as well.
          { path: 'customers', element: <CustomersPage /> },
          { path: 'customers/:id', element: <CustomerDetailPage /> },
          { path: 'users', element: <UsersPage /> },
        ],
      },
    ],
  },
];

export default adminRoutes;
