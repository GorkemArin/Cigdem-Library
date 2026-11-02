export interface PaginationInput {
  page?: number;
  perPage?: number;
  total: number;
}

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  offset: number;
  from: number;
  to: number;
  hasPrev: boolean;
  hasNext: boolean;
  pages: Array<number | 'gap'>;
}

export function parsePage(value: unknown): number {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) return 1;
  return Math.min(page, 10_000);
}

export function paginate({ page: rawPage = 1, perPage = 12, total }: PaginationInput): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, rawPage), totalPages);
  const offset = (page - 1) * perPage;

  const pages: Array<number | 'gap'> = [];
  for (let current = 1; current <= totalPages; current += 1) {
    if (
      current === 1 ||
      current === totalPages ||
      Math.abs(current - page) <= 1
    ) {
      pages.push(current);
    } else if (pages[pages.length - 1] !== 'gap') {
      pages.push('gap');
    }
  }

  return {
    page,
    perPage,
    total,
    totalPages,
    offset,
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(offset + perPage, total),
    hasPrev: page > 1,
    hasNext: page < totalPages,
    pages,
  };
}

export function pageQuery(page: number, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set('sayfa', String(page));
  const query = params.toString();
  return query ? `?${query}` : '';
}
