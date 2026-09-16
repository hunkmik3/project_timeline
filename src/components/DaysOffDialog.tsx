'use client';

import { useMemo, useState } from 'react';
import type { Holiday, ISODate, OffDaySettings, Weekday } from '@/lib/types';
import { COLUMN_TO_WEEKDAY, WEEKDAY_HEADERS, formatDate, todayISO } from '@/lib/date';
import Modal from './Modal';

interface Props {
  open: boolean;
  settings: OffDaySettings;
  holidays: Holiday[];
  holidaySource: string | null;
  holidayWarning: string | null;
  fetchedAt: string | null;
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
  onChange: (settings: OffDaySettings) => void;
}

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

const dateInputCls =
  'rounded border border-neutral-300 px-1.5 py-2 text-[16px] sm:py-1 sm:text-xs';

export default function DaysOffDialog({
  open,
  settings,
  holidays,
  holidaySource,
  holidayWarning,
  fetchedAt,
  loading,
  onRefresh,
  onClose,
  onChange,
}: Props) {
  const [customDate, setCustomDate] = useState<ISODate>(todayISO());
  const [customLabel, setCustomLabel] = useState('');
  const [workDate, setWorkDate] = useState<ISODate>(todayISO());

  const visibleHolidays = useMemo(
    () => holidays.filter((h) => h.official || h.workingDay || settings.includeObservances),
    [holidays, settings.includeObservances],
  );

  const patch = (p: Partial<OffDaySettings>) => onChange({ ...settings, ...p });

  const addCustom = () => {
    if (!customDate) return;
    if (settings.customOffDays.some((c) => c.date === customDate)) return;
    patch({
      customOffDays: [
        ...settings.customOffDays,
        { date: customDate, label: customLabel.trim() || 'Company day off' },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    });
    setCustomLabel('');
  };

  return (
    <Modal
      open={open}
      wide
      title="Days off"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-700"
        >
          Done
        </button>
      }
    >
      <div className="space-y-4 text-sm">
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-700">
            Weekly
          </h3>
          <div className="flex flex-wrap gap-1">
            {COLUMN_TO_WEEKDAY.map((wd, i) => {
              const active = settings.weeklyOff.includes(wd);
              return (
                <button
                  key={wd}
                  type="button"
                  onClick={() => patch({ weeklyOff: toggle<Weekday>(settings.weeklyOff, wd) })}
                  className={`rounded border px-3 py-2 text-xs sm:px-2 sm:py-1 ${
                    active
                      ? 'border-[#1F4E5A] bg-[#1F4E5A] text-white'
                      : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {WEEKDAY_HEADERS[i]}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-700">
              Vietnamese public holidays
            </h3>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded border border-neutral-300 px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          <label className="mb-1 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-4 shrink-0 sm:size-3"
              checked={settings.useVNHolidays}
              onChange={(e) => patch({ useVNHolidays: e.target.checked })}
            />
            Apply Vietnamese public holidays
          </label>
          <label className="mb-2 flex items-center gap-2 text-xs text-neutral-600">
            <input
              type="checkbox"
              className="size-4 shrink-0 sm:size-3"
              checked={settings.includeObservances}
              onChange={(e) => patch({ includeObservances: e.target.checked })}
            />
            Also take unofficial days (Christmas, Easter…)
          </label>

          {holidayWarning && (
            <p className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
              {holidayWarning}
            </p>
          )}

          {fetchedAt && (
            <p className="mb-2 text-[10px] text-neutral-400">
              Source: {holidaySource === 'google-calendar' ? 'Google Calendar VN' : 'built-in fallback'}
              {' · updated '}
              {new Date(fetchedAt).toLocaleString('en-GB')}
            </p>
          )}

          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded border border-neutral-200 p-2 sm:space-y-0.5">
            {visibleHolidays.length === 0 && (
              <p className="text-[11px] text-neutral-400">No holidays in this date range.</p>
            )}
            {visibleHolidays.map((h) => (
              <label key={h.date} className="flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 sm:size-3"
                  checked={settings.useVNHolidays && !settings.disabledHolidays.includes(h.date)}
                  disabled={!settings.useVNHolidays}
                  onChange={() =>
                    patch({ disabledHolidays: toggle(settings.disabledHolidays, h.date) })
                  }
                />
                <span className="w-24 shrink-0 tabular-nums text-neutral-500">
                  {formatDate(h.date)}
                </span>
                <span className="truncate">{h.name}</span>
                {h.workingDay ? (
                  <span className="ml-auto shrink-0 rounded bg-sky-100 px-1 text-[9px] font-semibold text-sky-700">
                    make-up workday
                  </span>
                ) : (
                  !h.official && (
                    <span className="ml-auto shrink-0 rounded bg-neutral-100 px-1 text-[9px] text-neutral-500">
                      unofficial
                    </span>
                  )
                )}
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-700">
            Custom days off
          </h3>
          {/* Two rows on phones; sm:contents drops the wrapper so it sits on one line. */}
          <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-1">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className={`w-full sm:w-auto ${dateInputCls}`}
            />
            <div className="flex gap-1.5 sm:contents">
              <input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Reason (e.g. Team building)"
                className={`min-w-0 flex-1 ${dateInputCls}`}
              />
              <button
                type="button"
                onClick={addCustom}
                className="shrink-0 rounded bg-neutral-900 px-3 py-2 text-xs text-white hover:bg-neutral-700 sm:px-2 sm:py-1"
              >
                Add
              </button>
            </div>
          </div>

          {settings.customOffDays.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {settings.customOffDays.map((c) => (
                <li key={c.date} className="flex items-center gap-2 text-[11px]">
                  <span className="w-24 shrink-0 tabular-nums text-neutral-500">
                    {formatDate(c.date)}
                  </span>
                  <span className="truncate">{c.label}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${c.label}`}
                    onClick={() =>
                      patch({
                        customOffDays: settings.customOffDays.filter((x) => x.date !== c.date),
                      })
                    }
                    className="ml-auto shrink-0 text-red-500"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-neutral-700">
            Make-up workdays
          </h3>
          <p className="mb-1.5 text-[11px] text-neutral-500">
            Force a working day even if it lands on a weekend or a holiday.
          </p>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-1">
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className={`w-full sm:w-auto ${dateInputCls}`}
            />
            <button
              type="button"
              onClick={() => patch({ workingOverrides: toggle(settings.workingOverrides, workDate) })}
              className="rounded border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50 sm:px-2 sm:py-1"
            >
              {settings.workingOverrides.includes(workDate) ? 'Remove make-up day' : 'Mark as workday'}
            </button>
          </div>
          {settings.workingOverrides.length > 0 && (
            <p className="mt-1.5 text-[11px] text-neutral-500">
              Working: {settings.workingOverrides.map(formatDate).join(', ')}
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}
