'use client';

import type { Task, TaskCategory, TaskPreset } from '@/lib/types';
import { resolveTaskColors } from '@/lib/calendar';
import { formatRangeShort } from '@/lib/date';

interface Props {
  /** The names set up in Task list — the spine of this panel. */
  library: TaskPreset[];
  /** Everything landing in this month, whether it was drawn or not. */
  tasks: Task[];
  categories: TaskCategory[];
  selectedIds: string[];
  onSelectTask: (id: string) => void;
  /** Alt-click picks a task out without opening it. */
  onToggleSelect: (id: string) => void;
  onAddNamed: (preset: TaskPreset) => void;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The colour a preset will draw with, before any task exists for it. */
function presetColor(preset: TaskPreset, categories: TaskCategory[]) {
  return resolveTaskColors(
    {
      id: preset.id,
      name: preset.name,
      start: '',
      end: '',
      categoryId: null,
      color: preset.color,
      textColor: preset.textColor,
      note: '',
      order: 0,
    },
    categories,
  );
}

const ROW =
  'flex w-full items-start gap-2 rounded px-1.5 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800';

export default function MonthTaskPanel({
  library,
  tasks,
  categories,
  selectedIds,
  onSelectTask,
  onToggleSelect,
  onAddNamed,
}: Props) {
  const selected = new Set(selectedIds);
  const claimed = new Set<string>();

  /**
   * One row per library name, expanded to one row per occurrence when a name is
   * scheduled more than once in the month. Names with nothing on the calendar
   * still appear — seeing what is not yet placed is the point of the panel.
   */
  type Row = { key: string; preset: TaskPreset; task: Task | null };
  const fromLibrary = library.flatMap((preset): Row[] => {
    const matches = tasks.filter((t) => same(t.name, preset.name));
    matches.forEach((t) => claimed.add(t.id));
    if (matches.length === 0) return [{ key: preset.id, preset, task: null }];
    return matches.map((task) => ({ key: task.id, preset, task }));
  });

  // Anything scheduled whose name is not in the list — one-offs, or work added
  // before the list existed. Without this they would have no way back.
  const others = tasks.filter((t) => !claimed.has(t.id));

  const line = (
    key: string,
    name: string,
    color: string,
    task: Task | null,
    onClick: () => void,
  ) => (
    <button
      key={key}
      type="button"
      onClick={(e) => {
        if (task && e.altKey) {
          e.preventDefault();
          onToggleSelect(task.id);
          return;
        }
        onClick();
      }}
      title={task ? undefined : `Not scheduled this month — click to add ${name}`}
      className={`${ROW} ${
        task && selected.has(task.id) ? 'bg-neutral-100 ring-1 ring-blue-500 dark:bg-neutral-800' : ''
      } ${task ? '' : 'opacity-50'}`}
    >
      <span
        className="mt-1 size-3 shrink-0 rounded-sm border border-black/10"
        style={{ backgroundColor: color }}
      />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[13px] font-semibold leading-tight [overflow-wrap:anywhere]">
          {name}
        </span>
        <span className="block truncate text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">
          {task ? formatRangeShort(task.start, task.end) : 'not scheduled'}
        </span>
        {task?.note && (
          <span className="line-clamp-2 block text-[11px] italic leading-tight text-neutral-400 [overflow-wrap:anywhere] dark:text-neutral-500">
            {task.note}
          </span>
        )}
      </span>
    </button>
  );

  return (
    <>
      <h3 className="mb-2 shrink-0 text-[11px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Task list · {library.length}
      </h3>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {library.length === 0 && others.length === 0 && (
          <p className="py-4 text-center text-[12px] text-neutral-400 dark:text-neutral-500">
            Nothing yet. Set names up under <span className="font-semibold">Task list</span>.
          </p>
        )}

        {fromLibrary.map(({ key, preset, task }) =>
          line(
            key,
            task ? task.name : preset.name,
            task
              ? resolveTaskColors(task, categories).color
              : presetColor(preset, categories).color,
            task,
            () => (task ? onSelectTask(task.id) : onAddNamed(preset)),
          ),
        )}

        {others.length > 0 && (
          <>
            <h4 className="px-1.5 pt-2 text-[10px] font-bold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              Not in the list
            </h4>
            {others.map((task) =>
              line(task.id, task.name, resolveTaskColors(task, categories).color, task, () =>
                onSelectTask(task.id),
              ),
            )}
          </>
        )}
      </div>
    </>
  );
}
