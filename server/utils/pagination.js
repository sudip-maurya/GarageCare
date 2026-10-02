/**
 * Backward-compatible pagination helper.
 * If neither page nor limit query parameter is provided, returns isPaginated: false
 * so that controllers can return their default plain-array responses.
 */
function getPagination(req) {
  const hasPage = req.query.page !== undefined && req.query.page !== '';
  const hasLimit = req.query.limit !== undefined && req.query.limit !== '';

  if (!hasPage && !hasLimit) {
    return {
      isPaginated: false,
      page: 1,
      limit: 50,
      skip: 0
    };
  }

  let page = parseInt(req.query.page, 10);
  if (isNaN(page) || page < 1) page = 1;

  let limit = parseInt(req.query.limit, 10);
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;

  const skip = (page - 1) * limit;

  return {
    isPaginated: true,
    page,
    limit,
    skip
  };
}

function paginatedResponse({ data, total, page, limit }) {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
}

module.exports = {
  getPagination,
  paginatedResponse
};
