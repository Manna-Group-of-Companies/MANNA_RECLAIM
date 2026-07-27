/** Normalises page/limit/sort/order query params into a skip/limit window. */
export function parsePagination(query = {}, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit));
  return {
    page,
    limit,
    from: (page - 1) * limit,
    to: page * limit - 1,
    // Left blank on purpose - the caller falls back to its own defaultSort.
    sort: query.sort || '',
    ascending: String(query.order || 'desc').toLowerCase() === 'asc',
  };
}

export default parsePagination;
