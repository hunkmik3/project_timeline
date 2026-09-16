/** A 'YYYY-MM-DD' date, always read in local time — never timezone-shifted. */
export type ISODate = string;

/** 0 = Sunday ... 6 = Saturday, matching Date.getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TaskCategory {
  id: string;
  name: string;
  color: string;
  textColor: string;
}

export interface Task {
  id: string;
  name: string;
  start: ISODate;
  /** Inclusive. */
  end: ISODate;
  categoryId: string | null;
  /** Overrides the category colour when the user picks one. */
  color: string | null;
  textColor: string | null;
  note: string;
  order: number;
  /**
   * Tasks this one waits for: it starts once they have finished. Moving one of
   * them carries this task along by the same number of days.
   */
  dependsOn: string[];
}

/**
 * A reusable task name set up ahead of time, so placing work on the calendar is
 * a pick from a list rather than retyping the same names every month.
 */
export interface TaskPreset {
  id: string;
  name: string;
  /** Optional override; without it the colour is still guessed from the name. */
  color: string | null;
  textColor: string | null;
}

export interface CustomOffDay {
  date: ISODate;
  label: string;
}

export interface OffDaySettings {
  /** Defaults to [0] — Sunday off. */
  weeklyOff: Weekday[];
  useVNHolidays: boolean;
  /** Christmas, Easter… — not official days off in Vietnam. */
  includeObservances: boolean;
  /** Holidays the user unticked — still a working day. */
  disabledHolidays: ISODate[];
  customOffDays: CustomOffDay[];
  /** Forced working days — beat every rule, for make-up Saturdays/Sundays. */
  workingOverrides: ISODate[];
}

export interface Holiday {
  date: ISODate;
  name: string;
  /** true = official day off under the Labour Code. */
  official: boolean;
  /**
   * true = the opposite: a MAKE-UP WORKDAY (usually a Saturday) announced by the
   * government alongside a holiday block. Google's calendar lumps these in with
   * holidays, so they must be separated — otherwise the app marks a day off on
   * exactly the day everyone is at work.
   */
  workingDay: boolean;
}

export interface ProjectState {
  title: string;
  /** Left empty, it is derived from the tasks' own date range. */
  rangeStart: ISODate | null;
  rangeEnd: ISODate | null;
  tasks: Task[];
  categories: TaskCategory[];
  /** The names offered in the Add task dropdown. */
  taskLibrary: TaskPreset[];
  offDays: OffDaySettings;
}

export interface OffDayInfo {
  off: boolean;
  label?: string;
  kind?: 'weekly' | 'holiday' | 'custom';
}

export type OffDayResolver = (date: ISODate) => OffDayInfo;
