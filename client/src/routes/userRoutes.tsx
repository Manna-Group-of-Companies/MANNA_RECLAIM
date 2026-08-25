import { type RouteObject } from 'react-router-dom';
import { UserLayout } from '@/components/layout';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleHome } from './RoleHome';
import {
  BatchesPage,
  BearingPage,
  HistoryPage,
  LogPage,
  MachinesPage,

  QualityPage,
  ReportsPage,
  UserEfficiencyPage,
  SettingsPage,
  StockPage,
  WeighPage,
} from '@/pages/user';
import { userPaths } from '@/config/paths';
import { FLOOR_ROLES, LAB_ROLES } from '@/config/constants';

/**
 * Shop-floor routes - the index.html side of the app.
 *
 * Split in two behind the layout: Quality belongs to the lab and nothing else
 * does, so a supervisor typing /quality is turned away at the route rather than
 * merely finding the tab missing from the bar. Settings stays outside both
 * groups - it is where any account signs out.
 */
export const userRoutes: RouteObject[] = [
  {
    element: <ProtectedRoute redirectTo={userPaths.login} />,
    children: [
      {
        element: <UserLayout />,
        children: [
          { index: true, element: <RoleHome /> },
          {
            element: <ProtectedRoute redirectTo={userPaths.login} allow={LAB_ROLES} />,
            children: [{ path: 'quality', element: <QualityPage /> }],
          },
          {
            element: <ProtectedRoute redirectTo={userPaths.login} allow={FLOOR_ROLES} />,
            children: [
              { path: 'machines', element: <MachinesPage /> },
              { path: 'batches', element: <BatchesPage /> },
              { path: 'weigh', element: <WeighPage /> },

              // The yard, both ways round. The page asks for whichever endpoint
              // the account is entitled to and the server refuses the other, so
              // a supervisor here is reading the summary and could not read the
              // full table by any route through this component.
              { path: 'stock', element: <StockPage /> },
              { path: 'history', element: <HistoryPage /> },
              { path: 'bearing', element: <BearingPage /> },
              { path: 'reports', element: <ReportsPage /> },
              { path: 'efficiency', element: <UserEfficiencyPage /> },
            ],
          },
          { path: 'settings', element: <SettingsPage /> },
          // Beside Settings and outside both groups for the same reason: what
          // this tablet asked the server for is every account's own business,
          // including the lab's, and it is how a floor problem gets reported.
          { path: 'settings/log', element: <LogPage /> },
        ],
      },
    ],
  },
];

export default userRoutes;
