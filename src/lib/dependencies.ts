import type { ISODate, Task } from './types';
import { addDays, daysBetween, isSaneDate } from './date';

/**
 * A task lists what it waits for. Moving the thing it waits for should carry it
 * along, so the interesting direction is the other way — hence the index.
 */
function dependentsIndex(tasks: Task[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const task of tasks) {
    for (const predecessorId of task.dependsOn) {
      const list = index.get(predecessorId);
      if (list) list.push(task.id);
      else index.set(predecessorId, [task.id]);
    }
  }
  return index;
}

/** Everything downstream of these tasks, however many links away. */
export function dependentsOf(ids: string[], tasks: Task[]): Set<string> {
  const index = dependentsIndex(tasks);
  const found = new Set<string>();
  const queue = [...ids];

  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const next of index.get(current) ?? []) {
      // The guard also stops a cycle in stored data from spinning forever.
      if (found.has(next)) continue;
      found.add(next);
      queue.push(next);
    }
  }
  return found;
}

/**
 * True if making `taskId` wait for `predecessorId` would close a loop — the
 * predecessor already waits, directly or not, on the task itself.
 */
export function wouldCycle(taskId: string, predecessorId: string, tasks: Task[]): boolean {
  if (taskId === predecessorId) return true;
  return dependentsOf([taskId], tasks).has(predecessorId);
}

/**
 * Shifts the named tasks and everything waiting on them by the same number of
 * days, so the arrangement between them is preserved rather than recomputed.
 * A task already in the selection is not shifted twice.
 *
 * Returns null when any task would land outside the supported years: a partial
 * shift would break exactly the links this is meant to keep.
 */
export function shiftWithDependents(
  tasks: Task[],
  ids: string[],
  deltaDays: number,
): Task[] | null {
  if (deltaDays === 0 || ids.length === 0) return tasks;

  const moving = new Set(ids);
  for (const id of dependentsOf(ids, tasks)) moving.add(id);

  const shifted = tasks.map((task) =>
    moving.has(task.id)
      ? { ...task, start: addDays(task.start, deltaDays), end: addDays(task.end, deltaDays) }
      : task,
  );

  if (shifted.some((t) => moving.has(t.id) && (!isSaneDate(t.start) || !isSaneDate(t.end)))) {
    return null;
  }
  return shifted;
}

/**
 * Applies an edited task, then carries its dependents by however much its end
 * moved. Stretching a task by two days pushes what follows by two days;
 * pulling only its start earlier leaves them alone, because nothing they wait
 * for has changed.
 */
export function applyEditWithDependents(
  tasks: Task[],
  edited: Task,
  previousEnd: ISODate | null,
): Task[] | null {
  const withEdit = tasks.some((t) => t.id === edited.id)
    ? tasks.map((t) => (t.id === edited.id ? edited : t))
    : [...tasks, edited];

  if (!previousEnd || !isSaneDate(previousEnd) || !isSaneDate(edited.end)) return withEdit;

  const delta = daysBetween(previousEnd, edited.end);
  if (delta === 0) return withEdit;

  // Only the dependents move; the task itself already carries its new dates.
  const downstream = [...dependentsOf([edited.id], withEdit)];
  if (downstream.length === 0) return withEdit;

  return shiftWithDependents(withEdit, downstream, delta);
}

/** A link is broken when the follower starts on or before what it waits for ends. */
export function brokenLinks(task: Task, tasks: Task[]): Task[] {
  return task.dependsOn
    .map((id) => tasks.find((t) => t.id === id))
    .filter((p): p is Task => Boolean(p) && task.start <= (p as Task).end);
}
