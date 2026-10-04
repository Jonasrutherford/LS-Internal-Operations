import type { Catalog, TimeEntry } from './types';

/** Human labels for an entry, resolved through ids so renamed taxonomy reads correctly. */
export function describe(c: Catalog, e: Pick<TimeEntry, 'task_type_id' | 'custom_task_name' | 'category_id' | 'entity_kind' | 'client_id' | 'prospect_id' | 'partner_id' | 'work_type'>) {
  const task = e.task_type_id ? c.taskTypes.find((t) => t.id === e.task_type_id) : undefined;
  const category = c.categories.find((x) => x.id === e.category_id);
  let entity = '';
  if (e.work_type === 'external') {
    if (e.entity_kind === 'client') entity = c.clients.find((x) => x.id === e.client_id)?.name ?? 'Unknown client';
    else if (e.entity_kind === 'prospect') entity = e.prospect_id ? c.prospects.find((x) => x.id === e.prospect_id)?.name ?? 'Prospect' : 'General prospecting';
    else if (e.entity_kind === 'partner') entity = e.partner_id ? c.partners.find((x) => x.id === e.partner_id)?.name ?? 'Partner' : 'General partnership work';
  }
  return {
    task: task?.name ?? e.custom_task_name ?? 'Untitled task',
    custom: !task,
    taskType: task,
    category: category?.name ?? '',
    entity,
    where: e.work_type === 'internal' ? 'Internal' : entity,
  };
}
