import { NextResponse } from 'next/server';
import { VN_HOLIDAY_ICS, parseHolidayICS, filterHolidaysByYears } from '@/lib/holidays';
import type { Holiday } from '@/lib/types';

export const revalidate = 86400;

/**
 * Fixed solar-calendar holidays only. Used when Google Calendar is unreachable;
 * it misses Tết and Hùng Kings' day (lunar dates), so it always ships a warning.
 */
function fallbackHolidays(years: number[]): Holiday[] {
  const fixed: [string, string][] = [
    ['01-01', 'Tết dương lịch'],
    ['04-30', 'Ngày Giải phóng miền Nam'],
    ['05-01', 'Ngày Quốc tế Lao động'],
    ['09-02', 'Quốc khánh'],
  ];
  return years.flatMap((y) =>
    fixed.map(([md, name]) => ({ date: `${y}-${md}`, name, official: true, workingDay: false })),
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const years = (searchParams.get('years') ?? String(new Date().getFullYear()))
    .split(',')
    .map((y) => Number(y.trim()))
    .filter((y) => Number.isInteger(y) && y > 1970 && y < 2200);

  if (years.length === 0) {
    return NextResponse.json({ error: 'Invalid years parameter' }, { status: 400 });
  }

  const noCache = searchParams.get('refresh') === '1';

  try {
    const res = await fetch(VN_HOLIDAY_ICS, {
      // revalidate: 0 on an explicit refresh so Google is re-fetched.
      next: noCache ? { revalidate: 0 } : { revalidate },
      headers: { 'user-agent': 'project-timeline/1.0' },
    });
    if (!res.ok) throw new Error(`Google Calendar returned ${res.status}`);

    const ics = await res.text();
    const all = parseHolidayICS(ics);
    if (all.length === 0) throw new Error('No events could be parsed from the .ics feed');

    return NextResponse.json({
      source: 'google-calendar',
      fetchedAt: new Date().toISOString(),
      years,
      holidays: filterHolidaysByYears(all, years),
    });
  } catch (err) {
    return NextResponse.json({
      source: 'fallback',
      fetchedAt: new Date().toISOString(),
      years,
      warning:
        'Could not reach Google Calendar — using the built-in fallback list, which is missing Tết and Hùng Kings\' Commemoration Day because those follow the lunar calendar. Press Refresh to try again.',
      error: err instanceof Error ? err.message : String(err),
      holidays: fallbackHolidays(years),
    });
  }
}
