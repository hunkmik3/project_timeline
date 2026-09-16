'use client';

import { useState } from 'react';
import type { TaskCategory, TaskPreset } from '@/lib/types';
import { resolveTaskColors } from '@/lib/calendar';
import { SWATCHES, readableTextColor } from '@/lib/presets';
import { NO_AUTOFILL } from '@/lib/form';
import Modal from './Modal';

interface Props {
  open: boolean;
  library: TaskPreset[];
  categories: TaskCategory[];
  onClose: () => void;
  onChange: (library: TaskPreset[]) => void;
}

const inputCls =
  'w-full rounded border border-neutral-300 bg-white px-2 py-2 text-[16px] outline-none focus:border-blue-500 sm:py-1.5 sm:text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100';

/** The preset only carries a name and an optional colour; the swatch previews
 *  what the calendar will actually draw, guessed name included. */
function previewColors(preset: TaskPreset, categories: TaskCategory[]) {
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

export default function TaskListDialog({
  open,
  library,
  categories,
  onClose,
  onChange,
}: Props) {
  const [draft, setDraft] = useState('');
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const exists = (name: string) =>
    library.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());

  const addOne = () => {
    const name = draft.trim();
    if (!name || exists(name)) {
      setDraft('');
      return;
    }
    onChange([...library, { id: crypto.randomUUID(), name, color: null, textColor: null }]);
    setDraft('');
  };

  /**
   * Blank lines go, and so do repeats — both against the existing list and
   * within the pasted text itself. The count shown to the user runs through
   * here too, so it cannot promise more names than Import actually adds.
   */
  const parseBulk = (text: string): TaskPreset[] => {
    const seen = new Set(library.map((p) => p.name.trim().toLowerCase()));
    const out: TaskPreset[] = [];
    for (const line of text.split('\n')) {
      const name = line.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push({ id: crypto.randomUUID(), name, color: null, textColor: null });
    }
    return out;
  };

  const importBulk = () => {
    const added = parseBulk(bulk);
    if (added.length > 0) onChange([...library, ...added]);
    setBulk('');
    setShowBulk(false);
  };

  const patch = (id: string, p: Partial<TaskPreset>) =>
    onChange(library.map((item) => (item.id === id ? { ...item, ...p } : item)));

  const remove = (id: string) => onChange(library.filter((item) => item.id !== id));

  const pendingCount = parseBulk(bulk).length;

  return (
    <Modal
      open={open}
      wide
      title="Task list"
      onClose={onClose}
      footer={
        <>
          <span className="self-center text-[11px] text-neutral-500 dark:text-neutral-400">
            {library.length} {library.length === 1 ? 'name' : 'names'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            Done
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Set the names up once and pick them from the dropdown when adding a task.
        </p>

        <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-1">
          <input
            {...NO_AUTOFILL}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addOne();
              }
            }}
            placeholder="Task name, e.g. STORYBOARD"
            className={inputCls}
          />
          <div className="flex gap-1.5 sm:contents">
            <button
              type="button"
              onClick={addOne}
              className="shrink-0 rounded bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-700 sm:py-1.5 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowBulk((v) => !v)}
              className="shrink-0 rounded border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 sm:py-1.5 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {showBulk ? 'Cancel' : 'Paste list'}
            </button>
          </div>
        </div>

        {showBulk && (
          <div className="rounded border border-neutral-200 p-2 dark:border-neutral-700">
            <textarea
              value={bulk}
              autoFocus
              onChange={(e) => setBulk(e.target.value)}
              rows={6}
              placeholder={'One name per line:\nKICK-START\nTREATMENT\nCONCEPT\nSTORYBOARD'}
              className={`${inputCls} resize-y font-mono text-[13px]`}
            />
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {pendingCount} new {pendingCount === 1 ? 'name' : 'names'} — duplicates are skipped
              </span>
              <button
                type="button"
                onClick={importBulk}
                disabled={pendingCount === 0}
                className="ml-auto rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
              >
                Import
              </button>
            </div>
          </div>
        )}

        <div className="max-h-72 space-y-1.5 overflow-y-auto rounded border border-neutral-200 p-2 dark:border-neutral-700">
          {library.length === 0 && (
            <p className="py-6 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              No names yet. Add them one at a time, or paste a list.
            </p>
          )}

          {library.map((preset) => {
            const { color, textColor } = previewColors(preset, categories);
            return (
              <div key={preset.id}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Colour for ${preset.name}`}
                    onClick={() => setPickerFor(pickerFor === preset.id ? null : preset.id)}
                    className="size-8 shrink-0 rounded border border-neutral-300 sm:size-6 dark:border-neutral-600"
                    style={{ backgroundColor: color }}
                  />
                  <input
                    {...NO_AUTOFILL}
                    value={preset.name}
                    onChange={(e) => patch(preset.id, { name: e.target.value })}
                    className={`${inputCls} font-semibold uppercase`}
                    style={{ backgroundColor: color, color: textColor }}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${preset.name}`}
                    onClick={() => remove(preset.id)}
                    className="size-8 shrink-0 rounded text-sm text-red-500 hover:bg-red-50 sm:size-7 sm:text-xs dark:hover:bg-red-950"
                  >
                    ✕
                  </button>
                </div>

                {pickerFor === preset.id && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 rounded border border-neutral-200 p-2 dark:border-neutral-700">
                    {SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        aria-label={hex}
                        onClick={() => {
                          patch(preset.id, { color: hex, textColor: readableTextColor(hex) });
                          setPickerFor(null);
                        }}
                        className="size-7 rounded border border-neutral-300 sm:size-5 dark:border-neutral-600"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        patch(preset.id, { color: null, textColor: null });
                        setPickerFor(null);
                      }}
                      className="rounded border border-neutral-300 px-2 text-[11px] text-neutral-600 dark:border-neutral-600 dark:text-neutral-300"
                    >
                      By name
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
