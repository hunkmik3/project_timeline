'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Holiday, ISODate, OffDaySettings, ProjectState, Task, TaskPreset } from '@/lib/types';
import { buildTimeline, countWorkingDays, makeOffDayResolver, resolveRange } from '@/lib/calendar';
import { applyEditWithDependents, shiftWithDependents } from '@/lib/dependencies';
import {
  addDays,
  firstOfMonth,
  isSaneDate,
  lastOfMonth,
  shiftMonth,
  todayISO,
} from '@/lib/date';
import {
  emptyProject,
  loadProject,
  readLocalProject,
  saveProject,
  storageMode,
  subscribeProject,
} from '@/lib/storage';
import TimelineCalendar from './TimelineCalendar';
import TaskDialog from './TaskDialog';
import DaysOffDialog from './DaysOffDialog';
import TaskListDialog from './TaskListDialog';
import { NO_AUTOFILL } from '@/lib/form';
import {
  THEME_LABELS,
  THEME_ORDER,
  applyTheme,
  readStoredTheme,
  watchSystemTheme,
  type Theme,
} from '@/lib/theme';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface HolidayMeta {
  source: string | null;
  warning: string | null;
  fetchedAt: string | null;
}

/** Empty months kept either side of the work, so there is always somewhere to
 *  scroll into when planning ahead or looking back. */
const PAD_MONTHS_BEFORE = 2;
const PAD_MONTHS_AFTER = 6;

/** ?p=<slug> keeps a separate timeline per project in the same app. */
const subscribeNoop = () => () => {};
const readSlug = () =>
  new URLSearchParams(window.location.search).get('p')?.trim() || 'default';

export default function TimelineApp() {
  // Reading the URL through useSyncExternalStore instead of setState in an
  // effect: no hydration mismatch and no extra render pass.
  const slug = useSyncExternalStore(subscribeNoop, readSlug, () => 'default');
  const [project, setProject] = useState<ProjectState>(emptyProject);
  const [loaded, setLoaded] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayMeta, setHolidayMeta] = useState<HolidayMeta>({
    source: null,
    warning: null,
    fetchedAt: null,
  });
  const [holidayLoading, setHolidayLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);

  /** Task currently open in the dialog; null means the dialog is closed. */
  const [editing, setEditing] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [daysOffOpen, setDaysOffOpen] = useState(false);
  const [taskListOpen, setTaskListOpen] = useState(false);
  /** Tasks picked out on the calendar; Alt-click adds to this, a plain click replaces it. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Phones default to fitting the whole month on screen; off means scroll wider. */
  const [fitWidth, setFitWidth] = useState(true);

  /** Local work found after switching to Supabase, offered for one-click import. */
  const [strandedLocal, setStrandedLocal] = useState<ProjectState | null>(null);

  // Safe as a lazy initializer: nothing theme-dependent is rendered until the
  // project has loaded, so this never reaches the prerendered HTML.
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window === 'undefined' ? 'auto' : readStoredTheme(),
  );

  // Skips the first save right after loading, and saves echoed back by realtime.
  const skipNextSave = useRef(true);
  const didInitialScroll = useRef(false);

  const scrollToToday = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const d = new Date();
    document
      .getElementById(`m-${d.getFullYear()}-${d.getMonth() + 1}`)
      ?.scrollIntoView({ behavior, block: 'start' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadProject(slug)
      .then((data) => {
        if (cancelled) return;
        if (data) setProject(data);
        // First run against Supabase: the shared row is empty but this browser
        // may still hold the work entered before the switch.
        if (storageMode === 'supabase' && (data?.tasks.length ?? 0) === 0) {
          const local = readLocalProject(slug);
          if (local && local.tasks.length > 0) setStrandedLocal(local);
        }
        skipNextSave.current = true;
        setLoaded(true);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!loaded) return;
    return subscribeProject(slug, (incoming) => {
      skipNextSave.current = true;
      setProject(incoming);
    });
  }, [loaded, slug]);

  const range = useMemo(
    () => resolveRange(project.tasks, project.rangeStart, project.rangeEnd),
    [project.tasks, project.rangeStart, project.rangeEnd],
  );

  /** Every month on one page: the work, today, and padding to scroll into. */
  const viewBounds = useMemo(() => {
    const today = todayISO();
    const from = shiftMonth(range.start < today ? range.start : today, -PAD_MONTHS_BEFORE);
    const to = shiftMonth(range.end > today ? range.end : today, PAD_MONTHS_AFTER);
    return {
      start: firstOfMonth(from.year, from.month),
      end: lastOfMonth(to.year, to.month),
    };
  }, [range.start, range.end]);

  // Holidays must cover the padded months too, not just the task range —
  // otherwise scrolling into an empty future year shows no holidays at all.
  const years = useMemo(() => {
    const from = Number(viewBounds.start.slice(0, 4));
    const to = Number(viewBounds.end.slice(0, 4));
    const list: number[] = [];
    // Capped: a stray year in the data must not turn into a request listing
    // every year since 1970, nor a days-off list nobody can read.
    for (let y = from; y <= to && list.length < 12; y += 1) list.push(y);
    return list;
  }, [viewBounds]);

  const fetchHolidays = useCallback(async (targetYears: number[], refresh = false) => {
    if (targetYears.length === 0) return;
    setHolidayLoading(true);
    try {
      const url = `/api/holidays?years=${targetYears.join(',')}${refresh ? '&refresh=1' : ''}`;
      const res = await fetch(url, refresh ? { cache: 'no-store' } : undefined);
      const json = await res.json();
      setHolidays(json.holidays ?? []);
      setHolidayMeta({
        source: json.source ?? null,
        warning: json.warning ?? null,
        fetchedAt: json.fetchedAt ?? null,
      });
    } catch {
      setHolidayMeta((m) => ({ ...m, warning: 'Could not reach the holiday service.' }));
    } finally {
      setHolidayLoading(false);
    }
  }, []);

  // When the range moves into a new year, pull that year's holidays.
  // Deferred to a microtask so the loading flag is not set synchronously
  // inside the effect, which would cost an extra render pass.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void fetchHolidays(years);
    });
    return () => {
      cancelled = true;
    };
  }, [years, fetchHolidays]);

  // Autosave, coalescing edits made within 600ms.
  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    setSaveState('saving');
    const id = setTimeout(() => {
      saveProject(slug, project)
        .then(() => setSaveState('saved'))
        .catch((e: Error) => {
          setSaveState('error');
          setError(e.message);
        });
    }, 600);
    return () => clearTimeout(id);
  }, [project, loaded, slug]);

  // Months run from before the project to well after it, so landing at the very
  // top would open on an old empty month. Jump to today once, without animating.
  useEffect(() => {
    if (!loaded || didInitialScroll.current) return;
    didInitialScroll.current = true;
    scrollToToday('instant');
  }, [loaded, scrollToToday]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIds([]);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    // On "Auto", keep following the OS if the user flips it while this is open.
    return watchSystemTheme(theme);
  }, [theme]);

  const isOff = useMemo(
    () => makeOffDayResolver(project.offDays, holidays),
    [project.offDays, holidays],
  );

  const blocks = useMemo(
    () =>
      buildTimeline(project.tasks, project.categories, isOff, viewBounds.start, viewBounds.end),
    [project.tasks, project.categories, isOff, viewBounds],
  );

  /** Tasks that render nowhere — otherwise there is no way back to them. */
  const hiddenTasks = useMemo(
    () =>
      project.tasks.filter(
        (t) =>
          !isSaneDate(t.start) ||
          !isSaneDate(t.end) ||
          t.start > t.end ||
          countWorkingDays(t, isOff) === 0,
      ),
    [project.tasks, isOff],
  );

  const setOffDays = (offDays: OffDaySettings) => setProject((p) => ({ ...p, offDays }));
  const setLibrary = (taskLibrary: TaskPreset[]) => setProject((p) => ({ ...p, taskLibrary }));

  const openNewTask = (opts: { preset?: TaskPreset; start?: ISODate; end?: ISODate } = {}) => {
    const { preset, start: pickedStart, end: pickedEnd } = opts;
    const today = todayISO();
    const sorted = [...project.tasks].sort((a, b) => a.end.localeCompare(b.end));
    const last = sorted[sorted.length - 1];
    // Chain onto the end of the last task; everything is on one scrollable page
    // so there is no "current month" to bias towards.
    // Dates dragged on the calendar win; otherwise chain onto the last task.
    const start = pickedStart ?? (last?.end && isSaneDate(last.end) ? addDays(last.end, 1) : today);
    setEditing({
      isNew: true,
      task: {
        id: crypto.randomUUID(),
        // Clicking an unscheduled name in the month panel arrives with its
        // preset, so the dialog opens already filled in.
        name: preset?.name ?? '',
        start,
        end: pickedEnd ?? addDays(start, 2),
        categoryId: null,
        color: preset?.color ?? null,
        textColor: preset?.textColor ?? null,
        note: '',
        order: project.tasks.length,
        dependsOn: [],
      },
    });
  };

  const openTask = (id: string) => {
    const task = project.tasks.find((t) => t.id === id);
    if (!task) return;
    setSelectedIds([id]);
    setEditing({ task, isNew: false });
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  /**
   * Shifts whole tasks, keeping their length. Refused outright if it would
   * carry any of them past the supported year range — a partial move would
   * leave the selection split across a boundary nobody asked for.
   */
  const moveTasks = (ids: string[], deltaDays: number) => {
    if (deltaDays === 0 || ids.length === 0) return;
    // Whatever waits on these tasks travels with them, by the same number of
    // days, so the gaps between linked work survive the move.
    const next = shiftWithDependents(project.tasks, ids, deltaDays);
    if (!next) {
      setError('That move would push a task outside the supported dates.');
      return;
    }
    setProject((p) => ({ ...p, tasks: next }));
  };

  const saveTask = (task: Task) => {
    const previousEnd = project.tasks.find((t) => t.id === task.id)?.end ?? null;
    const next = applyEditWithDependents(project.tasks, task, previousEnd);
    if (!next) {
      setError('That change would push a dependent task outside the supported dates.');
      return;
    }
    setProject((p) => ({ ...p, tasks: next }));
    setEditing(null);
  };

  const deleteTask = (id: string) => {
    setProject((p) => ({
      ...p,
      // Also unlink it: a dependency pointing at a deleted task is a dangling
      // reference that would quietly stop propagating.
      tasks: p.tasks
        .filter((t) => t.id !== id)
        .map((t) =>
          t.dependsOn.includes(id) ? { ...t, dependsOn: t.dependsOn.filter((d) => d !== id) } : t,
        ),
    }));
    setSelectedIds((ids) => ids.filter((x) => x !== id));
    setEditing(null);
  };

  const exportAs = async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      const res = await fetch(format === 'pdf' ? '/api/export-pdf' : '/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project, holidays }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.title || 'timeline'}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const saveLabel =
    saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save failed';

  // The page is prerendered at build time, so anything derived from "now" — the
  // month label, the today highlight — would be baked into the HTML and mismatch
  // on hydration in any later month. Nothing date-dependent renders until the
  // client has loaded the project.
  if (!loaded) {
    return (
      <div className="flex h-dvh items-center justify-center bg-neutral-100 text-sm text-neutral-400 dark:bg-[#0f0f11]">
        Loading…
      </div>
    );
  }

  return (
    // h-dvh, not h-screen: on mobile the collapsing address bar makes 100vh
    // taller than the visible area, which would push the toolbar out of view.
    <div className="flex h-dvh flex-col bg-neutral-100 text-neutral-900 dark:bg-[#0f0f11] dark:text-neutral-100">
      <header className="shrink-0 border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-[#17171a]">
        <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
          <input
            {...NO_AUTOFILL}
            value={project.title}
            onChange={(e) => setProject((p) => ({ ...p, title: e.target.value }))}
            aria-label="Project title"
            className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm font-bold outline-none hover:border-neutral-200 focus:border-blue-500 sm:text-base dark:hover:border-neutral-700"
          />

          <span
            className={`hidden shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase sm:inline ${
              storageMode === 'supabase'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'
            }`}
            title={
              storageMode === 'supabase'
                ? 'Stored in Supabase — shared with the team'
                : 'Supabase not configured — stored in this browser only'
            }
          >
            {storageMode === 'supabase' ? 'Shared DB' : 'Local only'}
          </span>

          {saveState !== 'idle' && (
            <>
              <span
                className={`hidden shrink-0 text-xs sm:inline ${
                  saveState === 'error' ? 'text-red-600 dark:text-red-400' : 'text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {saveLabel}
              </span>
              {/* Narrow screens have no room for the words — show a status dot. */}
              <span
                aria-label={saveLabel}
                title={saveLabel}
                className={`size-2 shrink-0 rounded-full sm:hidden ${
                  saveState === 'error'
                    ? 'bg-red-500'
                    : saveState === 'saving'
                      ? 'bg-amber-400'
                      : 'bg-emerald-500'
                }`}
              />
            </>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto px-3 pb-2 sm:px-4">
          <button
            type="button"
            onClick={() => openNewTask()}
            className="shrink-0 rounded bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            + Add task
          </button>
          <button
            type="button"
            onClick={() => scrollToToday()}
            className="shrink-0 rounded border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setTaskListOpen(true)}
            className="shrink-0 rounded border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Task list
          </button>
          <button
            type="button"
            onClick={() => setDaysOffOpen(true)}
            className="shrink-0 rounded border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Days off
          </button>
          <button
            type="button"
            onClick={() => setFitWidth((v) => !v)}
            className="shrink-0 rounded border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-600 lg:hidden dark:border-neutral-600 dark:text-neutral-300"
          >
            {fitWidth ? 'Zoom in' : 'Fit width'}
          </button>
          <button
            type="button"
            onClick={() => setTheme(THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length])}
            title="Switch between Auto, Light and Dark"
            className="shrink-0 rounded border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {THEME_LABELS[theme]}
          </button>

          <button
            type="button"
            onClick={() => exportAs('xlsx')}
            disabled={exporting !== null}
            className="ml-auto shrink-0 rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {exporting === 'xlsx' ? 'Exporting…' : 'Export Excel'}
          </button>
          <button
            type="button"
            onClick={() => exportAs('pdf')}
            disabled={exporting !== null}
            className="shrink-0 rounded bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
          >
            {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </header>

      {error && (
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:px-4 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 font-bold">
            ✕
          </button>
        </div>
      )}

      {strandedLocal && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 sm:px-4 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
          <span>
            This browser still has a timeline saved locally ({strandedLocal.tasks.length} tasks)
            from before the shared database was connected. Import it?
          </span>
          <button
            type="button"
            onClick={() => {
              setProject(strandedLocal);
              setStrandedLocal(null);
            }}
            className="rounded bg-sky-700 px-2.5 py-1 font-semibold text-white hover:bg-sky-800"
          >
            Import
          </button>
          <button
            type="button"
            onClick={() => setStrandedLocal(null)}
            className="rounded border border-sky-300 px-2.5 py-1 font-semibold hover:bg-sky-100 dark:border-sky-700 dark:hover:bg-sky-900"
          >
            Ignore
          </button>
        </div>
      )}

      {hiddenTasks.length > 0 && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:px-4 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <span className="mr-1">
            {hiddenTasks.length} task{hiddenTasks.length > 1 ? 's' : ''} not shown (invalid dates or
            entirely on days off):
          </span>
          {hiddenTasks.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openTask(t.id)}
              className="mr-1 font-semibold underline underline-offset-2"
            >
              {t.name || '(untitled)'}
            </button>
          ))}
        </div>
      )}

      {/* Owns the vertical scroll and the snap points, so each month comes to
          rest filling the screen instead of stopping halfway. */}
      <main
        id="timeline-print"
        className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto scroll-smooth"
      >
        <TimelineCalendar
          blocks={blocks}
          categories={project.categories}
          library={project.taskLibrary}
          allTasks={project.tasks}
          title={project.title}
          selectedIds={selectedIds}
          onSelectTask={openTask}
          onToggleSelect={toggleSelect}
          onMoveTasks={moveTasks}
          onClearSelection={() => setSelectedIds([])}
          onAddTask={(preset) => openNewTask({ preset })}
          onAddRange={(start, end) => openNewTask({ start, end })}
          fitWidth={fitWidth}
        />
      </main>

      <TaskDialog
        key={editing?.task.id ?? 'closed'}
        task={editing?.task ?? null}
        isNew={editing?.isNew ?? false}
        categories={project.categories}
        library={project.taskLibrary}
        allTasks={project.tasks}
        isOff={isOff}
        onClose={() => setEditing(null)}
        onSave={saveTask}
        onDelete={deleteTask}
      />

      <TaskListDialog
        open={taskListOpen}
        library={project.taskLibrary}
        categories={project.categories}
        onClose={() => setTaskListOpen(false)}
        onChange={setLibrary}
      />

      <DaysOffDialog
        open={daysOffOpen}
        settings={project.offDays}
        holidays={holidays}
        holidaySource={holidayMeta.source}
        holidayWarning={holidayMeta.warning}
        fetchedAt={holidayMeta.fetchedAt}
        loading={holidayLoading}
        onRefresh={() => void fetchHolidays(years, true)}
        onClose={() => setDaysOffOpen(false)}
        onChange={setOffDays}
      />
    </div>
  );
}
