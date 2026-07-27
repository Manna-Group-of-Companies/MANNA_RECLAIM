/** Every successful body is `{ success: true, message, data, meta? }`. */
export const ok = (res, data = null, message = 'OK', meta) =>
  res.status(200).json({ success: true, message, data, ...(meta ? { meta } : {}) });

export const created = (res, data = null, message = 'Created') =>
  res.status(201).json({ success: true, message, data });

export const noContent = (res) => res.status(204).send();

export const paginated = (res, { rows, total, page, limit }, message = 'OK') =>
  res.status(200).json({
    success: true,
    message,
    data: rows,
    meta: { total, page, limit, pages: limit ? Math.ceil(total / limit) : 1 },
  });

export default { ok, created, noContent, paginated };
