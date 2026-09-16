import type { Holiday, ISODate } from './types';
import { addDays } from './date';

export const VN_HOLIDAY_ICS =
  'https://calendar.google.com/calendar/ical/vi.vietnamese%23holiday%40group.v.calendar.google.com/public/basic.ics';

/**
 * Official days off under the Vietnamese Labour Code. The Google calendar mixes
 * in Christmas / Easter / New Year's Eve, which are ordinary working days in
 * Vietnam, so those are separated out for the user to opt into.
 */
const OBSERVANCE_PATTERNS = [
  /giáng sinh/i,
  /gi[aá]ng sinh/i,
  /n[oô]en|noel/i,
  /phục sinh/i,
  /valentine/i,
  /halloween/i,
  /quốc tế thiếu nhi/i,
  /phụ nữ/i,
  /nhà giáo/i,
  /vu lan/i,
  /trung thu/i,
];

const OFFICIAL_PATTERNS = [
  /tết/i,
  /giỗ tổ/i,
  /hùng vương/i,
  /giải phóng/i,
  /thống nhất/i,
  /quốc tế lao động/i,
  /quốc khánh/i,
  /nghỉ bù/i,
];

/** "Ngày làm việc (Tết Nguyên Đán)" means a make-up WORKDAY, not a day off. */
const WORKING_DAY_PATTERNS = [/ngày làm việc/i, /làm bù/i, /đi làm/i];

export type HolidayKind = 'official' | 'observance' | 'working';

export function classifyHoliday(summary: string): HolidayKind {
  // Make-up workdays must be checked first: their names contain "Tết", so they
  // are easily mistaken for official holidays.
  if (WORKING_DAY_PATTERNS.some((re) => re.test(summary))) return 'working';
  // Then observances, so "chủa nhật phục sinh" never counts as official.
  if (OBSERVANCE_PATTERNS.some((re) => re.test(summary))) return 'observance';
  return OFFICIAL_PATTERNS.some((re) => re.test(summary)) ? 'official' : 'observance';
}

const KIND_RANK: Record<HolidayKind, number> = { working: 3, official: 2, observance: 1 };

/** Undo RFC 5545 line folding: continuation lines start with a space or tab. */
function unfold(ics: string): string[] {
  const raw = ics.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function icsDateToISO(v: string): ISODate | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Returns one entry per calendar DAY (multi-day events are expanded).
 * DTEND in iCal is exclusive, so it is rolled back a day.
 */
export function parseHolidayICS(ics: string): Holiday[] {
  const lines = unfold(ics);
  const byDate = new Map<ISODate, Holiday>();

  let summary: string | null = null;
  let start: ISODate | null = null;
  let end: ISODate | null = null;
  let inEvent = false;

  const flush = () => {
    if (summary && start) {
      // No DTEND -> single-day event. With DTEND -> exclusive, so step back a day.
      const last = end ? addDays(end, -1) : start;
      const kind = classifyHoliday(summary);
      const entry = {
        name: summary,
        official: kind === 'official',
        workingDay: kind === 'working',
      };
      for (let d = start; d <= last; d = addDays(d, 1)) {
        const existing = byDate.get(d);
        // Same date wins in this order: make-up workday > official > observance.
        const existingRank = existing
          ? KIND_RANK[existing.workingDay ? 'working' : existing.official ? 'official' : 'observance']
          : 0;
        if (KIND_RANK[kind] > existingRank) {
          byDate.set(d, { date: d, ...entry });
        }
      }
    }
    summary = null;
    start = null;
    end = null;
  };

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      inEvent = true;
      summary = null;
      start = null;
      end = null;
      continue;
    }
    if (line.startsWith('END:VEVENT')) {
      flush();
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).split(';')[0].toUpperCase();
    const value = line.slice(sep + 1);

    if (key === 'SUMMARY') summary = unescapeText(value);
    else if (key === 'DTSTART') start = icsDateToISO(value);
    else if (key === 'DTEND') end = icsDateToISO(value);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function filterHolidaysByYears(list: Holiday[], years: number[]): Holiday[] {
  const set = new Set(years.map(String));
  return list.filter((h) => set.has(h.date.slice(0, 4)));
}
