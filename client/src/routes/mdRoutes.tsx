import { Navigate, type RouteObject } from 'react-router-dom';
import { MdLayout } from '@/components/layout';
import { ProtectedRoute } from './ProtectedRoute';
import { AdminHistoryPage, ApprovalsPage, EfficiencyPage } from '@/pages/admin';
import { MdOverviewPage } from '@/pages/md';
import { mdPaths } from '@/config/paths';
import { SUMMARY_ROLES } from '@/config/constants';

/**
 * The managing director's three screens.
 *
 * Gated on SUMMARY_ROLES, which is md plus the back office - a manager opening
 * these reads the same two pages rather than being bounced, and the guard stays
 * one list wide either way. Everyone else goes to their own home.
 *
 * Efficiency is the back office's page, not a copy of it. It reads the same
 * shift against the same ideals; what it does not offer this account is the
 * three buttons that write a reason - see the read-only note in EfficiencyPage.
 * A second copy would have been a screen that quietly stops matching the one
 * the manager is looking at.
 */
export const mdRoutes: RouteObject[] = [
  {
    path: 'md',
    element: <ProtectedRoute redirectTo={mdPaths.login} allow={SUMMARY_ROLES} />,
    children: [
      {
        element: <MdLayout />,
        children: [
          { index: true, element: <Navigate to={mdPaths.overview} replace /> },
          { path: 'overview', element: <MdOverviewPage /> },
          { path: 'efficiency', element: <EfficiencyPage /> },
          // The approvals board, read-only. The managing director watches the
          // process run without being able to sign anything off.
          { path: 'approvals', element: <ApprovalsPage /> },
          // The back office's own History, read-only for this account - see the
          // note in HistoryPage on what comes off it and what still guards it.
          { path: 'history', element: <AdminHistoryPage /> },
        ],
      },
    ],
  },
];

export default mdRoutes;
