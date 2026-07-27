import { Navigate, type RouteObject } from 'react-router-dom';
import { UserLayout } from '@/components/layout';
import { ProtectedRoute } from './ProtectedRoute';
import {
  BatchesPage,
  DispatchPage,
  HistoryPage,
  MachinesPage,
  ReportsPage,
  SettingsPage,
  WeighPage,
} from '@/pages/user';
import { userPaths } from '@/config/paths';

/** Shop-floor routes - the index.html side of the app. */
export const userRoutes: RouteObject[] = [
  {
    element: <ProtectedRoute redirectTo={userPaths.login} />,
    children: [
      {
        element: <UserLayout />,
        children: [
          { index: true, element: <Navigate to={userPaths.machines} replace /> },
          { path: 'machines', element: <MachinesPage /> },
          { path: 'batches', element: <BatchesPage /> },
          { path: 'weigh', element: <WeighPage /> },
          { path: 'dispatch', element: <DispatchPage /> },
          { path: 'history', element: <HistoryPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
];

export default userRoutes;
