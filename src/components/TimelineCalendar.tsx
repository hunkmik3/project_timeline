'use client';

import type { MonthBlock } from '@/lib/calendar';
import { WEEKDAY_HEADERS, formatDate } from '@/lib/date';

interface Props {
  blocks: MonthBlock[];
  title: string;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onAddTask: () => void;
  /** Mobile: squeeze all 7 columns to the screen width instead of scrolling. */
  fitWidth: boolean;
}

const CELL = 'border border-neutral-300 text-center dark:border-neutral-700';

export default function TimelineCalendar({
  blocks,
  title,
  selectedTaskId,
  onSelectTask,
  onAddTask,
  fitWidth,
}: Props) {
  // Fitting the width leaves ~50px per column on a phone, so the type shrinks too.
  const dayText = fitWidth ? 'text-[11px] lg:text-[13px]' : 'text-[13px]';
  const blockText = fitWidth ? 'text-[9px] lg:text-[11px]' : 'text-[11px]';
  const headText = fitWidth ? 'text-[10px] lg:text-[13px]' : 'text-[13px]';

  if (blocks.length === 0) {
    return (
      <div className="p-8 text-center sm:p-12">
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          No tasks yet. Add one and the calendar builds itself.
        </p>
        <button
          type="button"
          onClick={onAddTask}
          className="rounded bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          + Add task
        </button>
      </div>
    );
  }

  return (
    // Zoomed mode sets a min width so block labels stay readable and the view
    // scrolls sideways. Desktop is always wide enough, so no min width there.
    <div
      id="timeline-print"
      className={`bg-white p-3 sm:p-6 dark:bg-[#151518] ${fitWidth ? '' : 'min-w-[680px]'} lg:min-w-0`}
    >
      <div className="mb-4 inline-block bg-[#00FF00] px-3 py-1 text-sm font-bold text-black sm:mb-6">
        {title}
      </div>

      {blocks.map((block) => (
        <section key={block.key} id={`m-${block.key}`} className="mb-8 sm:mb-10">
          <h2 className="mb-3 text-center text-lg font-bold tracking-wide text-neutral-900 sm:text-xl dark:text-neutral-100">
            {block.label}
          </h2>

          <div className="grid grid-cols-7">
            {WEEKDAY_HEADERS.map((label, i) => (
              <div
                key={label}
                className={`${CELL} ${headText} py-1 font-medium ${
                  i === 6 ? 'bg-[#1F4E5A] text-white' : 'bg-[#00FFFF] text-black'
                }`}
              >
                {label}
              </div>
            ))}
          </div>

          {block.weeks.map((week) => (
            <div key={week.key}>
              {/* Date numbers */}
              <div className="grid grid-cols-7">
                {week.days.map((day, i) => (
                  <div
                    key={i}
                    className={`${CELL} ${dayText} py-1 ${
                      day.date && day.isOff ? 'bg-[#1F4E5A] text-white' : 'text-neutral-800 dark:text-neutral-300'
                    } ${day.isToday ? 'font-bold ring-1 ring-inset ring-blue-500' : ''}`}
                    title={day.offLabel}
                  >
                    {day.day ?? ''}
                  </div>
                ))}
              </div>

              {/* Lane rows — task blocks live here */}
              {Array.from({ length: week.laneCount }, (_, lane) => (
                <div key={lane} className="grid grid-cols-7">
                  {week.days.map((day, i) => (
                    <div
                      key={i}
                      className={`${CELL} h-6 ${day.date && day.isOff ? 'bg-[#1F4E5A]' : ''}`}
                      // Pin to row 1 explicitly so background cells and task
                      // blocks overlap; auto-placement would push cells down.
                      style={{ gridColumn: `${i + 1} / span 1`, gridRow: 1 }}
                    />
                  ))}

                  {week.placed
                    .filter((p) => p.lane === lane)
                    .flatMap((p) =>
                      p.segments.map((seg, si) => (
                        <button
                          type="button"
                          key={`${p.task.id}-${si}`}
                          onClick={() => onSelectTask(p.task.id)}
                          title={`${p.task.name} · ${formatDate(p.task.start)} → ${formatDate(p.task.end)}`}
                          className={`flex h-6 items-center justify-center overflow-hidden border border-neutral-300 px-0.5 font-bold leading-none sm:px-1 dark:border-neutral-700 ${blockText} ${
                            selectedTaskId === p.task.id ? 'ring-2 ring-inset ring-blue-600' : ''
                          }`}
                          style={{
                            gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}`,
                            gridRow: 1,
                            backgroundColor: p.color,
                            color: p.textColor,
                          }}
                        >
                          <span className="truncate">{p.task.name}</span>
                        </button>
                      )),
                    )}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
