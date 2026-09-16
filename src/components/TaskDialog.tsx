'use client';

import { useState } from 'react';
import type { OffDayResolver, Task, TaskCategory } from '@/lib/types';
import { countWorkingDays, effectiveCategoryId, resolveTaskColors } from '@/lib/calendar';
import { SWATCHES, readableTextColor } from '@/lib/presets';
import Modal from './Modal';

interface Props {
  /** null means the dialog is closed. */
  task: Task | null;
  isNew: boolean;
  categories: TaskCategory[];
  isOff: OffDayResolver;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete: (id: string) => void;
}

// 16px on mobile: anything smaller makes Safari iOS zoom the page on focus.
const inputCls =
  'w-full rounded border border-neutral-300 bg-white px-2 py-2 text-[16px] outline-none focus:border-blue-500 sm:py-1.5 sm:text-sm';

const labelCls = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-500';

export default function TaskDialog({
  task,
  isNew,
  categories,
  isOff,
  onClose,
  onSave,
  onDelete,
}: Props) {
  // Remounted per task via `key` in the parent, so the initial value is enough.
  const [draft, setDraft] = useState<Task | null>(task);

  if (!task || !draft) return null;

  const patch = (p: Partial<Task>) => setDraft({ ...draft, ...p });

  const { color, textColor } = resolveTaskColors(draft, categories);
  const invalidRange = Boolean(draft.start && draft.end && draft.start > draft.end);
  const missingName = draft.name.trim() === '';
  const workingDays = countWorkingDays(draft, isOff);
  const canSave = !invalidRange && !missingName && Boolean(draft.start && draft.end);

  return (
    <Modal
      open
      title={isNew ? 'New task' : 'Edit task'}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <button
              type="button"
              onClick={() => onDelete(draft.id)}
              className="rounded border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave({ ...draft, name: draft.name.trim() })}
            className="rounded bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={labelCls} htmlFor="task-name">
            Task name
          </label>
          <input
            id="task-name"
            autoFocus
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="e.g. CONCEPT"
            className={`${inputCls} font-semibold uppercase`}
            style={{ backgroundColor: color, color: textColor }}
          />
          {missingName && (
            <p className="mt-1 text-[11px] text-amber-600">Give the task a name to save it.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls} htmlFor="task-start">
              Start
            </label>
            <input
              id="task-start"
              type="date"
              value={draft.start}
              onChange={(e) => patch({ start: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="task-end">
              End
            </label>
            <input
              id="task-end"
              type="date"
              value={draft.end}
              min={draft.start}
              onChange={(e) => patch({ end: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>

        {invalidRange ? (
          <p className="text-[11px] font-semibold text-red-600">End date is before the start date.</p>
        ) : workingDays === 0 ? (
          <p className="text-[11px] font-semibold text-amber-600">
            This range falls entirely on days off — the task will not appear on the calendar.
          </p>
        ) : (
          <p className="text-[11px] text-neutral-500">
            {workingDays} working {workingDays === 1 ? 'day' : 'days'} (days off excluded)
          </p>
        )}

        <div>
          <label className={labelCls} htmlFor="task-type">
            Type
          </label>
          <select
            id="task-type"
            value={effectiveCategoryId(draft, categories) ?? ''}
            onChange={(e) =>
              patch({ categoryId: e.target.value || null, color: null, textColor: null })
            }
            className={inputCls}
          >
            <option value="">Auto — match by name</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className={labelCls}>Colour</span>
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={hex}
                onClick={() => patch({ color: hex, textColor: readableTextColor(hex) })}
                className={`size-8 rounded border sm:size-6 ${
                  draft.color === hex ? 'border-blue-600 ring-2 ring-blue-500' : 'border-neutral-300'
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
            <button
              type="button"
              onClick={() => patch({ color: null, textColor: null })}
              className={`rounded border px-2 text-[11px] ${
                draft.color === null
                  ? 'border-blue-600 text-blue-700'
                  : 'border-neutral-300 text-neutral-600'
              }`}
            >
              By type
            </button>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="task-note">
            Note
          </label>
          <input
            id="task-note"
            value={draft.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="Optional"
            className={inputCls}
          />
        </div>
      </div>
    </Modal>
  );
}
