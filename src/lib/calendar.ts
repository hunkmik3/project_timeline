import type {
  Holiday,
  ISODate,
  OffDayResolver,
  OffDaySettings,
  Task,
  TaskCategory,
} from './types';
import {
  MONTH_NAMES_EN,
  addDays,
  columnIndex,
  firstOfMonth,
  getWeekday,
  lastOfMonth,
  monthsBetween,
  startOfWeek,
  todayISO,
} from './date';
import { DEFAULT_CATEGORIES, guessCategoryId } from './presets';

export interface DayCell {
  /** null = blank cell because the date belongs to another month. */
  date: ISODate | null;
  day: number | null;
  isOff: boolean;
  offLabel?: string;
  isToday: boolean;
}

/** One unbroken piece of a block within a week (days off split a task up). */
export interface TaskSegment {
  startCol: number;
  /** Inclusive. */
  endCol: number;
}

export interface PlacedTask {
  task: Task;
  lane: number;
  color: string;
  textColor: string;
  segments: TaskSegment[];
  /** Task already started before this week/month. */
  continuesLeft: boolean;
  continuesRight: boolean;
}

export interface WeekRow {
  key: string;
  weekStart: ISODate;
  days: DayCell[];
  laneCount: number;
  placed: PlacedTask[];
}

export interface MonthBlock {
  key: string;
  year: number;
  month: number;
  label: string;
  weeks: WeekRow[];
}

export const DEFAULT_OFF_DAYS: OffDaySettings = {
  weeklyOff: [0],
  useVNHolidays: true,
  includeObservances: false,
  disabledHolidays: [],
  customOffDays: [],
  workingOverrides: [],
};

export function makeOffDayResolver(
  settings: OffDaySettings,
  holidays: Holiday[],
): OffDayResolver {
  const weekly = new Set(settings.weeklyOff);
  const forceWork = new Set(settings.workingOverrides);
  const disabled = new Set(settings.disabledHolidays);

  const custom = new Map(settings.customOffDays.map((c) => [c.date, c.label]));

  const holidayMap = new Map<ISODate, string>();
  const workFromHolidays = new Set<ISODate>();
  if (settings.useVNHolidays) {
    for (const h of holidays) {
      if (disabled.has(h.date)) continue;
      if (h.workingDay) {
        workFromHolidays.add(h.date);
        continue;
      }
      if (!h.official && !settings.includeObservances) continue;
      holidayMap.set(h.date, h.name);
    }
  }

  return (date: ISODate) => {
    // A forced working day beats every day-off rule.
    if (forceWork.has(date)) return { off: false };

    // Custom days off outrank the public calendar — companies have their own.
    const customLabel = custom.get(date);
    if (customLabel !== undefined) {
      return { off: true, label: customLabel || 'Day off', kind: 'custom' };
    }

    // Government-announced make-up Saturdays: work even on a weekly day off.
    if (workFromHolidays.has(date)) return { off: false };

    const holidayName = holidayMap.get(date);
    if (holidayName) return { off: true, label: holidayName, kind: 'holiday' };

    if (weekly.has(getWeekday(date))) return { off: true, kind: 'weekly' };

    return { off: false };
  };
}

/**
 * The task's effective type: whatever the user picked, otherwise guessed from
 * the name. Guessing belongs here rather than in the form, because data also
 * arrives from the database and from imports.
 */
export function effectiveCategoryId(task: Task, categories: TaskCategory[]): string | null {
  if (task.categoryId && categories.some((c) => c.id === task.categoryId)) return task.categoryId;
  const guessed = guessCategoryId(task.name, DEFAULT_CATEGORIES);
  return guessed && categories.some((c) => c.id === guessed) ? guessed : null;
}

export function resolveTaskColors(
  task: Task,
  categories: TaskCategory[],
): { color: string; textColor: string } {
  const catId = effectiveCategoryId(task, categories);
  const cat = catId ? categories.find((c) => c.id === catId) : undefined;
  return {
    color: task.color ?? cat?.color ?? '#D9D9D9',
    textColor: task.textColor ?? cat?.textColor ?? '#000000',
  };
}

/** Visible range: the user's range if set, otherwise one that wraps the tasks. */
export function resolveRange(
  tasks: Task[],
  rangeStart: ISODate | null,
  rangeEnd: ISODate | null,
): { start: ISODate; end: ISODate } {
  if (rangeStart && rangeEnd && rangeStart <= rangeEnd) {
    return { start: rangeStart, end: rangeEnd };
  }

  const valid = tasks.filter((t) => t.start && t.end);
  if (valid.length === 0) {
    const today = todayISO();
    const [y, m] = today.split('-').map(Number);
    return { start: firstOfMonth(y, m), end: lastOfMonth(y, m) };
  }

  const minStart = valid.reduce((a, t) => (t.start < a ? t.start : a), valid[0].start);
  const maxEnd = valid.reduce((a, t) => (t.end > a ? t.end : a), valid[0].end);
  return { start: rangeStart ?? minStart, end: rangeEnd ?? maxEnd };
}

/** Split [startCol..endCol] into unbroken runs, skipping days off and out-of-month cells. */
function buildSegments(startCol: number, endCol: number, days: DayCell[]): TaskSegment[] {
  const segments: TaskSegment[] = [];
  let runStart = -1;

  for (let col = startCol; col <= endCol; col += 1) {
    const cell = days[col];
    const usable = cell.date !== null && !cell.isOff;
    if (usable) {
      if (runStart === -1) runStart = col;
    } else if (runStart !== -1) {
      segments.push({ startCol: runStart, endCol: col - 1 });
      runStart = -1;
    }
  }
  if (runStart !== -1) segments.push({ startCol: runStart, endCol });

  return segments;
}

export function buildTimeline(
  tasks: Task[],
  categories: TaskCategory[],
  isOff: OffDayResolver,
  rangeStart: ISODate | null,
  rangeEnd: ISODate | null,
): MonthBlock[] {
  const { start, end } = resolveRange(tasks, rangeStart, rangeEnd);
  const today = todayISO();

  const ordered = [...tasks]
    .filter((t) => t.start && t.end && t.start <= t.end)
    .sort((a, b) => a.start.localeCompare(b.start) || a.order - b.order || a.name.localeCompare(b.name));

  // Remember last week's lane so a long task does not hop between rows.
  const lastLane = new Map<string, number>();
  const blocks: MonthBlock[] = [];

  for (const { year, month } of monthsBetween(start, end)) {
    const monthStart = firstOfMonth(year, month);
    const monthEnd = lastOfMonth(year, month);
    const weeks: WeekRow[] = [];

    for (let weekStart = startOfWeek(monthStart); weekStart <= monthEnd; weekStart = addDays(weekStart, 7)) {
      const weekEnd = addDays(weekStart, 6);

      const days: DayCell[] = [];
      for (let i = 0; i < 7; i += 1) {
        const date = addDays(weekStart, i);
        const inMonth = date >= monthStart && date <= monthEnd;
        if (!inMonth) {
          days.push({ date: null, day: null, isOff: false, isToday: false });
          continue;
        }
        const info = isOff(date);
        days.push({
          date,
          day: Number(date.slice(8, 10)),
          isOff: info.off,
          offLabel: info.label,
          isToday: date === today,
        });
      }

      const placed: PlacedTask[] = [];
      const laneSpans: { startCol: number; endCol: number }[][] = [];

      for (const task of ordered) {
        const visStart = task.start > weekStart ? task.start : weekStart;
        const visEnd = task.end < weekEnd ? task.end : weekEnd;
        if (visStart > visEnd) continue;
        if (visEnd < monthStart || visStart > monthEnd) continue;

        const clampedStart = visStart < monthStart ? monthStart : visStart;
        const clampedEnd = visEnd > monthEnd ? monthEnd : visEnd;

        const startCol = columnIndex(clampedStart);
        const endCol = columnIndex(clampedEnd);
        const segments = buildSegments(startCol, endCol, days);
        // The whole span lands on days off -> nothing to draw this week.
        if (segments.length === 0) continue;

        const span = { startCol, endCol };
        const overlaps = (lane: number) =>
          (laneSpans[lane] ?? []).some((s) => s.startCol <= endCol && span.startCol <= s.endCol);

        const preferred = lastLane.get(task.id);
        let lane = preferred !== undefined && !overlaps(preferred) ? preferred : -1;
        if (lane === -1) {
          lane = 0;
          while (overlaps(lane)) lane += 1;
        }

        laneSpans[lane] = laneSpans[lane] ?? [];
        laneSpans[lane].push(span);
        lastLane.set(task.id, lane);

        const { color, textColor } = resolveTaskColors(task, categories);
        placed.push({
          task,
          lane,
          color,
          textColor,
          segments,
          continuesLeft: task.start < clampedStart,
          continuesRight: task.end > clampedEnd,
        });
      }

      weeks.push({
        key: `${year}-${month}-${weekStart}`,
        weekStart,
        days,
        laneCount: Math.max(1, laneSpans.length),
        placed,
      });
    }

    blocks.push({
      key: `${year}-${month}`,
      year,
      month,
      label: `${MONTH_NAMES_EN[month - 1]} ${year}`,
      weeks,
    });
  }

  return blocks;
}

/** Actual working days in a task (days off removed) — used to flag empty tasks. */
export function countWorkingDays(task: Task, isOff: OffDayResolver): number {
  if (!task.start || !task.end || task.start > task.end) return 0;
  let n = 0;
  for (let d = task.start; d <= task.end; d = addDays(d, 1)) {
    if (!isOff(d).off) n += 1;
  }
  return n;
}
