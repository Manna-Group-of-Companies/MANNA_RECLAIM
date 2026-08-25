import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { qualityService } from '../services/quality.service.js';

// `grade` and `batch_id` are aliases decorate() adds on the way out - a filter
// has to name the stored columns, `quality` and `batch_no`, or it matches
// nothing.
export const list = asyncHandler(async (req, res) =>
  paginated(res, await qualityService.list(req.query, {
    batch_no: req.query.batchNo ?? req.query.batchId,
    quality: req.query.grade,
    verdict: req.query.verdict,
    machine_id: req.query.machineId,
  })),
);

/**
 * Two different things about who filed this, and they are not interchangeable.
 *
 * `testedBy` is the name that goes on the test row - a person at the bench, who
 * is often not the account the tablet is signed in as, and who is free text
 * because the shift signs for its own samples. `testedByUserId` is the account,
 * and it is the only one of the two that may reach `stock_groups.qc_by`: that
 * column is a foreign key to `users`, so a name written into it is refused by
 * Postgres and takes the whole release with it.
 *
 * That is not hypothetical. It is what was happening to every verdict the lab
 * filed - the test saved, the foreign key refused the group, the failure was
 * logged rather than raised, and the yard went on showing stock the lab had
 * passed as awaiting the lab.
 */
export const record = asyncHandler(async (req, res) =>
  created(
    res,
    await qualityService.record({
      ...req.body,
      testedBy: req.body.testedBy ?? req.user?.name,
      testedByUserId: req.user?.id ?? null,
    }),
    'Test recorded',
  ),
);

export const attachReport = asyncHandler(async (req, res) =>
  ok(res, await qualityService.attachReport(req.params.id, req.body), 'Report attached'),
);

/**
 * The lab record by batch and then by grade - the shape the plant reads it in,
 * and the one the managing director is shown.
 */
export const byBatch = asyncHandler(async (req, res) =>
  ok(res, await qualityService.byBatch(req.query)),
);

export const summary = asyncHandler(async (req, res) =>
  ok(res, await qualityService.summary(req.query)),
);

export const remove = asyncHandler(async (req, res) =>
  ok(res, await qualityService.remove(req.params.id), 'Test removed'),
);
