import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { productService } from '../services/product.service.js';

/** The whole list, or only what the presses may still be set up for. */
export const list = asyncHandler(async (req, res) => {
  const activeOnly = req.query.active === 'true' || req.query.active === '1';
  return paginated(
    res,
    activeOnly ? await productService.listActive(req.query) : await productService.list(req.query),
  );
});

export const getOne = asyncHandler(async (req, res) =>
  ok(res, await productService.findById(req.params.id)),
);

export const create = asyncHandler(async (req, res) =>
  created(res, await productService.create(req.body), 'Product added'),
);

export const update = asyncHandler(async (req, res) =>
  ok(res, await productService.update(req.params.id, req.body), 'Product updated'),
);

/** Taken off the list, not deleted - press runs still name what they moulded. */
export const retire = asyncHandler(async (req, res) =>
  ok(res, await productService.retire(req.params.id), 'Product retired'),
);
