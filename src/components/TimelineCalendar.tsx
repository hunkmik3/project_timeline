'use client';

import { Fragment } from 'react';
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

/**
 * One month per screen. `h-full` resolves against <main>, which owns the scroll,
 * and `snap-start` is what makes the scroll come to rest on a month boundary
 * rather than halfway through one.
 */
const SECTION =
  'flex h-full snap-start flex-col justify-center px-2 py-[clamp(0.5rem,1.5svh,1rem)] sm:px-4 lg:px-6';

const CARD =
  'mx-auto flex h-[88%] max-h-full w-full max-w-7xl flex-col overflow-x-auto rounded-lg border border-neutral-200 bg-white p-[clamp(0.6rem,1.8svh,1.25rem)] shadow-sm dark:border-neutral-800 dark:bg-[#151518]';

/**
 * Every row of the month — the weekday header, each week's dates and each lane
 * under it — shares one grid so the fractions stretch to fill the screen. A
 * month with five weeks and a month with six both end up exactly one screen
 * tall, which is what keeps snapping honest. The floors stop a busy month from
 * squeezing rows into illegibility; past that the card scrolls instead.
 *
 * Lane rows get the larger share: they carry the task name and, under it, the
 * note — the content people actually read — while the date rows only hold a
 * number.
 */
const HEADER_ROW = 'minmax(0.9rem, 0.9fr)';
const DATE_ROW = 'minmax(0.85rem, 0.85fr)';
const LANE_ROW = 'minmax(1rem, 1.35fr)';

export default function TimelineCalendar({
  blocks,
  title,
  selectedTaskId,
  onSelectTask,
  onAddTask,
  fitWidth,
}: Props) {
  // Fitting the width leaves ~50px per column on a phone, so the type shrinks too.
  // The task name outranks the date number: it is what the calendar is for.
  const dayText = fitWidth
    ? 'text-[10px] sm:text-[clamp(0.6rem,1.45svh,0.85rem)]'
    : 'text-[11px] sm:text-[clamp(0.6rem,1.45svh,0.85rem)]';
  const nameText = fitWidth
    ? 'text-[10px] sm:text-[clamp(0.7rem,1.85svh,1.05rem)]'
    : 'text-[12px] sm:text-[clamp(0.7rem,1.85svh,1.05rem)]';
  const noteText = fitWidth
    ? 'text-[8px] sm:text-[clamp(0.55rem,1.35svh,0.8rem)]'
    : 'text-[10px] sm:text-[clamp(0.55rem,1.35svh,0.8rem)]';
  const headText = fitWidth
    ? 'text-[10px] sm:text-[clamp(0.66rem,1.65svh,0.9rem)]'
    : 'text-[13px] sm:text-[clamp(0.66rem,1.65svh,0.9rem)]';

  if (blocks.length === 0) {
    return (
      <section className={SECTION}>
        <div className={`${CARD} items-center justify-center text-center`}>
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
      </section>
    );
  }

  return (
    <>
      {blocks.map((block, index) => {
        // Row 1 is the weekday header; each week then takes a dates row followed
        // by one row per lane. Absolute indices let every cell live in one grid.
        let cursor = 1;
        const rowSizes = [HEADER_ROW];
        const weekRows = block.weeks.map((week) => {
          const dateRow = cursor + 1;
          const laneStart = dateRow + 1;
          cursor = laneStart + week.laneCount - 1;
          rowSizes.push(DATE_ROW, ...Array<string>(week.laneCount).fill(LANE_ROW));
          return { week, dateRow, laneStart };
        });

        return (
          <section key={block.key} id={`m-${block.key}`} className={SECTION}>
            <div className={CARD}>
              {/* Zoomed mode sets a min width so block labels stay readable and
                  the card scrolls sideways. Desktop is always wide enough. */}
              <div
                className={`flex min-h-0 flex-1 flex-col ${
                  fitWidth ? '' : 'min-w-[680px]'
                } lg:min-w-0`}
              >
                {/* The sheet banner belongs at the very top, not above every month. */}
                {index === 0 && (
                  <div className="mb-2 inline-block self-start bg-[#00FF00] px-3 py-1 text-sm font-bold text-black">
                    {title}
                  </div>
                )}

                <h2 className="mb-[clamp(0.35rem,1.2svh,1rem)] shrink-0 text-center text-[clamp(1.05rem,3.4svh,2rem)] font-bold tracking-wide text-neutral-900 dark:text-neutral-100">
                  {block.label}
                </h2>

                <div
                  className="grid min-h-0 flex-1 grid-cols-7"
                  style={{ gridTemplateRows: rowSizes.join(' ') }}
                >
                  {WEEKDAY_HEADERS.map((label, i) => (
                    <div
                      key={label}
                      className={`${CELL} ${headText} flex items-center justify-center font-medium ${
                        i === 6 ? 'bg-[#1F4E5A] text-white' : 'bg-[#00FFFF] text-black'
                      }`}
                      style={{ gridColumn: i + 1, gridRow: 1 }}
                    >
                      {label}
                    </div>
                  ))}

                  {weekRows.map(({ week, dateRow, laneStart }) => (
                    <Fragment key={week.key}>
                      {week.days.map((day, i) => (
                        <div
                          key={`d${i}`}
                          className={`${CELL} ${dayText} flex items-center justify-center ${
                            day.date && day.isOff
                              ? 'bg-[#1F4E5A] text-white'
                              : 'text-neutral-800 dark:text-neutral-300'
                          } ${day.isToday ? 'font-bold ring-1 ring-inset ring-blue-500' : ''}`}
                          style={{ gridColumn: i + 1, gridRow: dateRow }}
                          title={day.offLabel}
                        >
                          {day.day ?? ''}
                        </div>
                      ))}

                      {/* Lane backgrounds, drawn before the blocks that sit on top. */}
                      {Array.from({ length: week.laneCount }, (_, lane) =>
                        week.days.map((day, i) => (
                          <div
                            key={`l${lane}-${i}`}
                            className={`${CELL} ${day.date && day.isOff ? 'bg-[#1F4E5A]' : ''}`}
                            style={{ gridColumn: i + 1, gridRow: laneStart + lane }}
                          />
                        )),
                      )}

                      {week.placed.flatMap((p) =>
                        p.segments.map((seg, si) => (
                          <button
                            type="button"
                            key={`${p.task.id}-${si}`}
                            onClick={() => onSelectTask(p.task.id)}
                            title={`${p.task.name} · ${formatDate(p.task.start)} → ${formatDate(p.task.end)}`}
                            className={`flex flex-col items-center justify-center overflow-hidden border border-neutral-300 px-0.5 leading-tight sm:px-1 dark:border-neutral-700 ${
                              selectedTaskId === p.task.id ? 'ring-2 ring-inset ring-blue-600' : ''
                            }`}
                            style={{
                              gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}`,
                              gridRow: laneStart + p.lane,
                              backgroundColor: p.color,
                              color: p.textColor,
                            }}
                          >
                            <span className={`w-full truncate font-bold ${nameText}`}>
                              {p.task.name}
                            </span>
                            {p.task.note && (
                              <span className={`w-full truncate italic opacity-80 ${noteText}`}>
                                {p.task.note}
                              </span>
                            )}
                          </button>
                        )),
                      )}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
