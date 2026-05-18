import { createSpitexTemplateWorkbook, MONTH_NAMES } from '$lib/server/spitex-template.js';
import type { RequestHandler } from './$types';

function readNumber(searchParams: URLSearchParams, key: string, fallback: number): number {
  const value = Number(searchParams.get(key));
  return Number.isFinite(value) ? value : fallback;
}

export const GET: RequestHandler = async ({ url }) => {
  const year = readNumber(url.searchParams, 'year', 2026);
  const month = readNumber(url.searchParams, 'month', 1);
  const staffSlots = readNumber(url.searchParams, 'staffSlots', 12);
  const tourRows = readNumber(url.searchParams, 'tourRows', 400);

  const workbook = createSpitexTemplateWorkbook({ year, month, staffSlots, tourRows });
  const buffer = await workbook.xlsx.writeBuffer();
  const safeMonth = String(Math.max(1, Math.min(12, Math.trunc(month)))).padStart(2, '0');
  const monthName = MONTH_NAMES[Math.max(0, Math.min(11, Math.trunc(month) - 1))];
  const filename = `spitex-einsatzplanung-${year}-${safeMonth}-${monthName}.xlsx`;

  return new Response(buffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store'
    }
  });
};
