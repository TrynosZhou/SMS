export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  [key: string]: any;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
// Allow larger result sets when explicitly requested (e.g. loading all classes for teacher edit)
const MAX_LIMIT = 1000;

export const resolvePaginationParams = (
  pageParam?: string,
  limitParam?: string,
  fallbackLimit = DEFAULT_LIMIT
): PaginationParams => {
  const page = Math.max(parseInt(pageParam || '', 10) || DEFAULT_PAGE, DEFAULT_PAGE);
  const limitCandidate = parseInt(limitParam || '', 10);
  const normalizedLimit = Number.isFinite(limitCandidate) ? limitCandidate : fallbackLimit;
  const limit = Math.min(Math.max(normalizedLimit, 1), MAX_LIMIT);

  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
};

export const buildPaginationResponse = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  extra?: Record<string, any>
): PaginationResponse<T> => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    data,
    page,
    limit,
    total,
    totalPages,
    ...(extra || {})
  };
};

