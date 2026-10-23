import Link from 'next/link';
import PerPageSelect from './_per-page';
import { formatInt } from '@/lib/ui';

export type PageParams = Record<string, string | undefined>;

type PaginationProps = {
  basePath: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  params?: PageParams;
  perPageOptions?: number[];
  defaultPerPage?: number;
};

export function pageHref(
  basePath: string,
  params: PageParams,
  page: number,
  perPage: number,
  defaultPerPage: number
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== 'page' && key !== 'perPage') search.set(key, value);
  }
  if (page > 1) search.set('page', String(page));
  if (perPage !== defaultPerPage) search.set('perPage', String(perPage));
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function windowedPages(page: number, count: number): (number | 'gap')[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);
  const wanted = new Set(
    [1, 2, page - 1, page, page + 1, count - 1, count].filter((p) => p >= 1 && p <= count)
  );
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push('gap');
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * Reference-style table footer: numbered page buttons + prev/next on the
 * left, result range and a per-page select on the right. Sits inside the
 * table's card section as its last child. Renders nothing without rows.
 */
export default function Pagination({
  basePath,
  page,
  pageCount,
  total,
  pageSize,
  params = {},
  perPageOptions = [10, 20, 50],
  defaultPerPage = 20,
}: PaginationProps) {
  if (total <= 0 || pageCount <= 0) return null;

  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);
  const otherFilters = Object.entries(params).filter(
    ([key, value]) => value && key !== 'page' && key !== 'perPage'
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-border px-4 py-3 md:px-5">
      <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1 text-sm">
        {safePage > 1 ? (
          <Link
            href={pageHref(basePath, params, safePage - 1, pageSize, defaultPerPage)}
            className="btn btn-secondary btn-xs"
          >
            ‹ Previous
          </Link>
        ) : (
          <span className="btn btn-secondary btn-xs pointer-events-none text-gray-secondary/50">
            ‹ Previous
          </span>
        )}
        {windowedPages(safePage, pageCount).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} aria-hidden className="px-1 text-gray-secondary">
              …
            </span>
          ) : item === safePage ? (
            <span
              key={item}
              aria-current="page"
              className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-gray-border bg-white px-1.5 font-semibold text-secondary"
            >
              {item}
            </span>
          ) : (
            <Link
              key={item}
              href={pageHref(basePath, params, item, pageSize, defaultPerPage)}
              className="inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-gray-secondary transition-colors hover:text-secondary"
            >
              {item}
            </Link>
          )
        )}
        {safePage < pageCount ? (
          <Link
            href={pageHref(basePath, params, safePage + 1, pageSize, defaultPerPage)}
            className="btn btn-secondary btn-xs"
          >
            Next ›
          </Link>
        ) : (
          <span className="btn btn-secondary btn-xs pointer-events-none text-gray-secondary/50">
            Next ›
          </span>
        )}
      </nav>
      <div className="flex items-center gap-3 text-xs text-gray-secondary">
        <span>
          {formatInt(start)}–{formatInt(end)} of {formatInt(total)}
        </span>
        <form action={basePath} method="GET">
          {otherFilters.map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value!} />
          ))}
          <PerPageSelect value={pageSize} options={perPageOptions} />
        </form>
      </div>
    </div>
  );
}
