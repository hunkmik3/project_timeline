'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Holiday, OffDaySettings, ProjectState, Task } from '@/lib/types';
import { buildTimeline, countWorkingDays, makeOffDayResolver, resolveRange } from '@/lib/calendar';
import { addDays, firstOfMonth, isSaneDate, lastOfMonth, todayISO } from '@/lib/date';
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
import MonthNav, { monthOf, type YearMonth } from './MonthNav';
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

function currentMonth(): YearMonth {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

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
  const [exporting, setExporting] = useState(false);

  /** Task currently open in the dialog; null means the dialog is closed. */
  const [editing, setEditing] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [daysOffOpen, setDaysOffOpen] = useState(false);
  /** Phones default to fitting the whole month on screen; off means scroll wider. */
  const [fitWidth, setFitWidth] = useState(true);

  const [view, setView] = useState<YearMonth>(currentMonth);
  const [allMonths, setAllMonths] = useState(false);
  /** Local work found after switching to Supabase, offered for one-click import. */
  const [strandedLocal, setStrandedLocal] = useState<ProjectState | null>(null);

  // Safe as a lazy initializer: nothing theme-dependent is rendered until the
  // project has loaded, so this never reaches the prerendered HTML.
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window === 'undefined' ? 'auto' : readStoredTheme(),
  );

  // Skips the first save right after loading, and saves echoed back by realtime.
  const skipNextSave = useRef(true);

  useEffect(() => {
    let cancelled = false;
    loadProject(slug)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setProject(data);
          // Land on a month that actually has work: opening on an empty current
          // month would look like the project failed to load.
          const nowMonth = currentMonth();
          const from = firstOfMonth(nowMonth.year, nowMonth.month);
          const to = lastOfMonth(nowMonth.year, nowMonth.month);
          const overlapsNow = data.tasks.some((t) => t.start <= to && t.end >= from);
          if (!overlapsNow && data.tasks.length > 0) {
            const earliest = data.tasks.reduce((a, t) => (t.start < a ? t.start : a), data.tasks[0].start);
            setView(monthOf(earliest));
          }
        }
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

  /** Bounds handed to buildTimeline: one month, or the whole project. */
  const viewBounds = useMemo(
    () =>
      allMonths
        ? { start: project.rangeStart, end: project.rangeEnd }
        : { start: firstOfMonth(view.year, view.month), end: lastOfMonth(view.year, view.month) },
    [allMonths, project.rangeStart, project.rangeEnd, view.year, view.month],
  );

  // Holidays must cover the month being viewed too, not just the task range —
  // otherwise paging into an empty future year shows no holidays at all.
  const years = useMemo(() => {
    const from = Math.min(Number(range.start.slice(0, 4)), view.year);
    const to = Math.max(Number(range.end.slice(0, 4)), view.year);
    const list: number[] = [];
    // Capped: a stray year in the data must not turn into a request listing
    // every year since 1970, nor a days-off list nobody can read.
    for (let y = from; y <= to && list.length < 12; y += 1) list.push(y);
    return list;
  }, [range.start, range.end, view.year]);

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

  const monthStart = firstOfMonth(view.year, view.month);
  const monthEnd = lastOfMonth(view.year, view.month);

  const monthStats = useMemo(() => {
    let inMonth = 0;
    let before = false;
    let after = false;
    for (const t of project.tasks) {
      if (!t.start || !t.end) continue;
      if (t.start <= monthEnd && t.end >= monthStart) inMonth += 1;
      if (t.end < monthStart) before = true;
      if (t.start > monthEnd) after = true;
    }
    return { inMonth, before, after };
  }, [project.tasks, monthStart, monthEnd]);

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

  const openNewTask = () => {
    const today = todayISO();
    const sorted = [...project.tasks].sort((a, b) => a.end.localeCompare(b.end));
    const last = sorted[sorted.length - 1];
    // Chain onto the previous task when that lands in the month on screen,
    // otherwise start in the month being looked at — that is the whole point
    // of paging forward to set up a new month.
    const chained = last?.end ? addDays(last.end, 1) : today;
    const start = allMonths
      ? chained
      : chained >= monthStart && chained <= monthEnd
        ? chained
        : today >= monthStart && today <= monthEnd
          ? today
          : monthStart;
    setEditing({
      isNew: true,
      task: {
        id: crypto.randomUUID(),
        name: '',
        start,
        end: addDays(start, 2),
        categoryId: null,
        color: null,
        textColor: null,
        note: '',
        order: project.tasks.length,
      },
    });
  };

  const openTask = (id: string) => {
    const task = project.tasks.find((t) => t.id === id);
    if (task) setEditing({ task, isNew: false });
  };

  const saveTask = (task: Task) => {
    setProject((p) => ({
      ...p,
      tasks: p.tasks.some((t) => t.id === task.id)
        ? p.tasks.map((t) => (t.id === task.id ? task : t))
        : [...p.tasks, task],
    }));
    // Follow the task if it was dated into another month, otherwise saving
    // would look like the task disappeared.
    if (!allMonths && (task.end < monthStart || task.start > monthEnd)) {
      setView(monthOf(task.start));
    }
    setEditing(null);
  };

  const deleteTask = (id: string) => {
    setProject((p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== id) }));
    setEditing(null);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project, holidays }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.title || 'timeline'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
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
            onClick={openNewTask}
            className="shrink-0 rounded bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            + Add task
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
            onClick={exportExcel}
            disabled={exporting}
            className="ml-auto shrink-0 rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>

        <MonthNav
          view={view}
          allMonths={allMonths}
          hasTasksBefore={monthStats.before}
          hasTasksAfter={monthStats.after}
          taskCount={monthStats.inMonth}
          onChange={setView}
          onToggleAll={setAllMonths}
        />
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

      <main className="min-h-0 flex-1 overflow-auto p-3 lg:p-6">
        <div className="mx-auto max-w-5xl overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-[#151518]">
          <TimelineCalendar
            blocks={blocks}
            title={project.title}
            selectedTaskId={editing?.task.id ?? null}
            onSelectTask={openTask}
            onAddTask={openNewTask}
            fitWidth={fitWidth}
          />
        </div>
      </main>

      <TaskDialog
        key={editing?.task.id ?? 'closed'}
        task={editing?.task ?? null}
        isNew={editing?.isNew ?? false}
        categories={project.categories}
        isOff={isOff}
        onClose={() => setEditing(null)}
        onSave={saveTask}
        onDelete={deleteTask}
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
