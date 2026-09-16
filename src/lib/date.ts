import type { ISODate, Weekday } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Date -> 'YYYY-MM-DD' in local time (toISOString would shift across time zones). */
export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' -> Date at local midnight. */
export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // new Date(6, …) means 1906, not year 6 — the constructor maps 0-99 into the
  // 1900s. setFullYear is the only way to express a genuinely small year.
  date.setFullYear(y);
  return date;
}

/**
 * A date input lets someone type "0006" on the way to "2026", and that value is
 * submittable. Anything outside this window is a typo, not a plan, and left
 * unchecked it makes the timeline span centuries.
 */
export const MIN_YEAR = 1970;
export const MAX_YEAR = 2100;
export const MIN_DATE: ISODate = `${MIN_YEAR}-01-01`;
export const MAX_DATE: ISODate = `${MAX_YEAR}-12-31`;

export function isSaneDate(s: ISODate | null | undefined): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const year = Number(s.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function todayISO(): ISODate {
  return toISO(new Date());
}

export function getWeekday(s: ISODate): Weekday {
  return parseISO(s).getDay() as Weekday;
}

/** Column index in the Mon..Sun grid: Monday = 0, ..., Sunday = 6. */
export function columnIndex(s: ISODate): number {
  return (getWeekday(s) + 6) % 7;
}

/** Monday of the week containing this date. */
export function startOfWeek(s: ISODate): ISODate {
  return addDays(s, -columnIndex(s));
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function clampISO(s: ISODate, min: ISODate, max: ISODate): ISODate {
  if (s < min) return min;
  if (s > max) return max;
  return s;
}

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function firstOfMonth(year: number, month: number): ISODate {
  return `${year}-${pad(month)}-01`;
}

export function lastOfMonth(year: number, month: number): ISODate {
  return toISO(new Date(year, month, 0));
}

export const MONTH_NAMES_EN = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

/** Column headers in Mon..Sun order. */
export const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Weekday (0 = Sunday) for column i of the Mon..Sun grid. */
export const COLUMN_TO_WEEKDAY: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** Every (year, month) pair covering the given date range. */
export function monthsBetween(start: ISODate, end: ISODate): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  const s = parseISO(start);
  const e = parseISO(end);
  let y = s.getFullYear();
  let m = s.getMonth() + 1;
  while (y < e.getFullYear() || (y === e.getFullYear() && m <= e.getMonth() + 1)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "16 Sep 2026" — spelled-out month avoids the DD/MM vs MM/DD ambiguity. */
export function formatDate(s: ISODate): string {
  const d = parseISO(s);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
