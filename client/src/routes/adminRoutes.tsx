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
  IdealValuesPage,
  MaintenancePage,
  ProductsPage,
  RatesPage,
  UsersPage,
} from '@/pages/admin';
import { adminPaths } from '@/config/paths';
import { SETUP_ROLES } from '@/config/constants';

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

          /* What a manager runs the plant from - how it did, and what it is held to. */
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'history', element: <AdminHistoryPage /> },
          { path: 'efficiency', element: <EfficiencyPage /> },
          { path: 'rates', element: <RatesPage /> },
          { path: 'ideals', element: <IdealValuesPage /> },
          // The accounts, back with the manager: adding the supervisor who
          // started on Monday is running the plant, not setting it up.
          { path: 'users', element: <UsersPage /> },

          /**
           * The setting-up, behind a second guard: the admin account alone.
           *
           * These change what the plant *is* rather than report what it did -
           * the machine list, the products, the customers and their rates, and
           * the costing that prices all of it. A wrong entry on any of
           * them rewrites months of figures rather than one row, which is why
           * they take a deliberate sign-in rather than riding along with the
           * account somebody leaves open on a desk all day. Same reasoning as
           * DELETE_ROLES, one door further out.
           *
           * The guard is here as well as on the tab strip because a hidden tab
           * is not a guard: a manager typing /admin/costing is bounced to their
           * own home rather than shown the page.
           */
          {
            element: <ProtectedRoute redirectTo={adminPaths.login} allow={SETUP_ROLES} />,
            children: [
              { path: 'quality', element: <AdminQualityPage /> },
              { path: 'costing', element: <CostingPage /> },
              { path: 'maintenance', element: <MaintenancePage /> },
              { path: 'bearings', element: <BearingsPage /> },
              { path: 'products', element: <ProductsPage /> },
              { path: 'machines', element: <AdminMachinesPage /> },
              { path: 'customers', element: <CustomersPage /> },
              { path: 'customers/:id', element: <CustomerDetailPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export default adminRoutes;
