import { Navigate, type RouteObject } from 'react-router-dom';
import { MdLayout } from '@/components/layout';
import { ProtectedRoute } from './ProtectedRoute';
import { AdminHistoryPage, ApprovalsPage, EfficiencyPage } from '@/pages/admin';
import { MdOverviewPage } from '@/pages/md';
import { BatchQualityBoard } from '@/features/quality/BatchQualityBoard';
import { SapDispatchBoard } from '@/features/dispatch/SapDispatchBoard';
import { mdPaths } from '@/config/paths';
import { SUMMARY_ROLES } from '@/config/constants';

/**
 * The managing director's six screens.
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
          /*
           * What the lab found, by batch and then by grade.
           *
           * Its own board rather than the back office's Quality tab, which is a
           * working screen: it files verdicts, uploads reports and holds the
           * coarse sampling slots. None of that is an MD's, and a page of
           * controls that write is not made read-only by hiding the buttons.
           */
          { path: 'quality', element: <BatchQualityBoard /> },
          /*
           * What has gone out, off SAP's own documents. Not the yard's
           * dispatch screen, which raises them and is the supervisor's - this
           * account reads a quarter and issues nothing.
           */
          { path: 'dispatches', element: <SapDispatchBoard /> },
        ],
      },
    ],
  },
];

export default mdRoutes;
