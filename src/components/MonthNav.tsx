'use client';

import { MONTH_NAMES_EN } from '@/lib/date';

export interface YearMonth {
  year: number;
  /** 1-12. */
  month: number;
}

interface Props {
  view: YearMonth;
  allMonths: boolean;
  /** Draw a dot on an arrow when there is actually something over there. */
  hasTasksBefore: boolean;
  hasTasksAfter: boolean;
  taskCount: number;
  onChange: (view: YearMonth) => void;
  onToggleAll: (all: boolean) => void;
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

export function monthOf(date: string): YearMonth {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

export function isSameMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

const arrowCls =
  'relative flex size-9 shrink-0 items-center justify-center rounded border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-30 sm:size-8';

export default function MonthNav({
  view,
  allMonths,
  hasTasksBefore,
  hasTasksAfter,
  taskCount,
  onChange,
  onToggleAll,
}: Props) {
  const today = new Date();
  const thisMonth = { year: today.getFullYear(), month: today.getMonth() + 1 };

  return (
    <div className="flex items-center gap-2 border-t border-neutral-100 px-3 py-2 sm:px-4">
      <button
        type="button"
        aria-label="Previous month"
        disabled={allMonths}
        onClick={() => onChange(addMonths(view, -1))}
        className={arrowCls}
      >
        ‹
        {hasTasksBefore && !allMonths && (
          <span className="absolute bottom-1 size-1 rounded-full bg-emerald-500" />
        )}
      </button>

      {/* Fixed-ish width keeps the arrows together instead of letting them
          drift to the screen edges on a wide monitor. */}
      <div className="min-w-[124px] text-center sm:min-w-[180px]">
        <div className="truncate text-sm font-bold uppercase tracking-wide sm:text-base">
          {allMonths ? 'All months' : `${MONTH_NAMES_EN[view.month - 1]} ${view.year}`}
        </div>
        {!allMonths && (
          <div className="text-[10px] text-neutral-400">
            {taskCount === 0 ? 'no tasks' : `${taskCount} task${taskCount > 1 ? 's' : ''}`}
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="Next month"
        disabled={allMonths}
        onClick={() => onChange(addMonths(view, 1))}
        className={arrowCls}
      >
        ›
        {hasTasksAfter && !allMonths && (
          <span className="absolute bottom-1 size-1 rounded-full bg-emerald-500" />
        )}
      </button>

      <button
        type="button"
        onClick={() => {
          onToggleAll(false);
          onChange(thisMonth);
        }}
        disabled={!allMonths && isSameMonth(view, thisMonth)}
        className="ml-auto shrink-0 rounded border border-neutral-300 px-2.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 sm:py-1.5"
      >
        Today
      </button>

      <button
        type="button"
        onClick={() => onToggleAll(!allMonths)}
        className={`shrink-0 rounded border px-2.5 py-2 text-xs font-medium sm:py-1.5 ${
          allMonths
            ? 'border-neutral-900 bg-neutral-900 text-white'
            : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'
        }`}
      >
        All
      </button>
    </div>
  );
}
