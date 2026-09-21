'use client';

import { useEffect, useState } from 'react';
import {
  createProject,
  deleteProject,
  listProjects,
  uniqueSlug,
  type ProjectSummary,
} from '@/lib/storage';
import { NO_AUTOFILL } from '@/lib/form';
import Modal from './Modal';

interface Props {
  open: boolean;
  /** The project on screen — it cannot be deleted from under itself. */
  currentSlug: string;
  onClose: () => void;
}

const inputCls =
  'w-full rounded border border-neutral-300 bg-white px-2 py-2 text-[16px] outline-none focus:border-blue-500 sm:py-1.5 sm:text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100';

/**
 * Switching reloads the page rather than swapping state in place. A project
 * carries its own undo history, selection and scroll position, and a full
 * navigation drops all of it cleanly instead of leaving the last project's
 * leftovers behind.
 */
function goTo(slug: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('p', slug);
  window.location.href = url.toString();
}

export default function ProjectsDialog({ open, currentSlug, onClose }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listProjects()
      .then((list) => {
        if (cancelled) return;
        // The project on screen may not be saved yet — never list it as missing.
        setProjects(
          list.some((p) => p.slug === currentSlug)
            ? list
            : [{ slug: currentSlug, title: currentSlug, updatedAt: null }, ...list],
        );
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, currentSlug]);

  const create = async () => {
    const title = name.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const slug = uniqueSlug(title, (projects ?? []).map((p) => p.slug));
      await createProject(slug, title);
      goTo(slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the project');
      setBusy(false);
    }
  };

  const remove = async (slug: string) => {
    setBusy(true);
    try {
      await deleteProject(slug);
      setProjects((list) => (list ?? []).filter((p) => p.slug !== slug));
      setConfirming(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the project');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      wide
      title="Projects"
      onClose={onClose}
      footer={
        <>
          <span className="self-center text-[11px] text-neutral-500 dark:text-neutral-400">
            {projects === null ? 'Loading…' : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
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
          Each project keeps its own calendar, task list and days off.
        </p>

        <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-1">
          <input
            {...NO_AUTOFILL}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
            placeholder="New project name"
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={name.trim() === '' || busy}
            className="shrink-0 rounded bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-40 sm:py-1.5 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            Create
          </button>
        </div>

        {error && (
          <p className="rounded border border-red-300 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}

        <div className="max-h-80 space-y-1 overflow-y-auto rounded border border-neutral-200 p-2 dark:border-neutral-700">
          {projects === null && (
            <p className="py-6 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              Loading…
            </p>
          )}

          {projects?.map((p) => {
            const current = p.slug === currentSlug;
            return (
              <div
                key={p.slug}
                className={`flex items-center gap-2 rounded px-1.5 py-1.5 ${
                  current ? 'bg-neutral-100 dark:bg-neutral-800' : ''
                }`}
              >
                <button
                  type="button"
                  disabled={current}
                  onClick={() => goTo(p.slug)}
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                >
                  <span className="block truncate text-[13px] font-semibold">
                    {p.title}
                    {current && (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
                        open
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[10px] text-neutral-400 dark:text-neutral-500">
                    ?p={p.slug}
                    {p.updatedAt && ` · ${new Date(p.updatedAt).toLocaleDateString('en-GB')}`}
                  </span>
                </button>

                {confirming === p.slug ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(p.slug)}
                      className="shrink-0 rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Delete for good
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-[11px] dark:border-neutral-600"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    // Deleting the project you are looking at would leave the
                    // page editing something that no longer exists.
                    disabled={current}
                    title={current ? 'Switch to another project first' : `Delete ${p.title}`}
                    onClick={() => setConfirming(p.slug)}
                    className="size-7 shrink-0 rounded text-xs text-red-500 hover:bg-red-50 disabled:opacity-25 dark:hover:bg-red-950"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
