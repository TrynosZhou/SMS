export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  stats?: Record<string, any>;
  /** Finance list aggregates (GET /finance) */
  totalBalance?: number;
  totalInvoicedAmount?: number;
  totalPaidAmount?: number;
  /** Set when the service catches an HTTP error and returns an empty page */
  loadFailed?: boolean;
  errorMessage?: string;
}

