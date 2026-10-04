// What a person may pick when logging. One rule, used by every form and filter:
// Internal shows only internal and both; External shows only external and both,
// narrowed to the relationship (client, prospect, partner) being worked on.
// The database trigger check_time_entry enforces the same rule on write.

import type { Category, EntityKind, TaskType, WorkType } from './types';

export const fitsWorkType = (eligibility: string, wt: WorkType) =>
  eligibility === 'both' || eligibility === wt;

export function categoriesFor(
  categories: Category[], wt: WorkType, kind: EntityKind | null,
): Category[] {
  return categories
    .filter((c) => c.active && fitsWorkType(c.eligibility, wt))
    .filter((c) => wt === 'internal' || (kind != null && c.contexts.includes(kind)))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function tasksFor(taskTypes: TaskType[], categoryId: string, wt: WorkType): TaskType[] {
  return taskTypes
    .filter((t) => t.active && t.category_id === categoryId && fitsWorkType(t.eligibility, wt))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Categories a filter should list for a work type, regardless of relationship. */
export function categoriesForFilter(categories: Category[], wt: WorkType | 'all'): Category[] {
  return categories
    .filter((c) => wt === 'all' || fitsWorkType(c.eligibility, wt))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Expected minutes for one finished piece of work. Deliverable tasks scale by count. */
export function expectedMinutes(t: TaskType | undefined, qty: number | null): number | null {
  if (!t || t.expected_minutes == null) return null;
  if (t.has_deliverable) return qty && qty > 0 ? Number(t.expected_minutes) * qty : null;
  return Number(t.expected_minutes);
}

export function unitLabel(unit: string | null, n = 2) {
  if (!unit) return '';
  if (n === 1) return unit;
  if (unit.endsWith('s')) return unit;
  if (/(sh|ch|x)$/.test(unit)) return unit + 'es';
  return unit + 's';
}

export const CONTEXT_ORDER: EntityKind[] = ['client', 'prospect', 'partner'];
