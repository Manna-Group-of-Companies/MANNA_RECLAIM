import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { userService } from '../services/user.service.js';

export const list = asyncHandler(async (req, res) =>
  paginated(res, await userService.list(req.query, { role: req.query.role })),
);

export const getOne = asyncHandler(async (req, res) =>
  ok(res, await userService.findById(req.params.id)),
);

export const create = asyncHandler(async (req, res) =>
  created(res, await userService.create(req.body), 'User created'),
);

export const update = asyncHandler(async (req, res) =>
  ok(res, await userService.update(req.params.id, req.body), 'User updated'),
);

export const resetPin = asyncHandler(async (req, res) =>
  ok(res, await userService.setPin(req.params.id, req.body.pin), 'PIN updated'),
);

export const remove = asyncHandler(async (req, res) =>
  ok(res, await userService.remove(req.params.id), 'User removed'),
);
