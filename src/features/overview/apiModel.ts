import { count, object, timestamp, uuid } from '../../shared/http/validation';
import { parseCategoryFilter, type CategoryFilter } from '../projects/categoryFilter';
export type OverviewFilter = { category: CategoryFilter; projectId?: string };
const projectCounts = (value: unknown) => {
  const row = object(value);
  return { total: count(row.total), archived: count(row.archived) };
};
export function parseOverview(value: unknown, filter: OverviewFilter) {
  const row = object(value),
    projects = object(row.projects),
    tasks = object(row.tasks);
  const category = parseCategoryFilter(row.category);
  if (!Array.isArray(projects.byCategory)) throw new Error('Invalid Category buckets');
  const byCategory = projects.byCategory.map((value) => {
    const bucket = object(value);
    return {
      categoryId: bucket.categoryId === null ? null : uuid(bucket.categoryId),
      ...projectCounts(bucket),
    };
  });
  const projectId = row.projectId === null ? null : uuid(row.projectId);
  if (category !== filter.category || projectId !== (filter.projectId ?? null))
    throw new Error('Overview filter mismatch');
  return {
    category,
    projectId,
    projects: {
      ...projectCounts(projects),
      byCategory,
    },
    tasks: {
      todo: count(tasks.todo),
      doing: count(tasks.doing),
      done: count(tasks.done),
      total: count(tasks.total),
    },
    asOf: timestamp(row.asOf),
    externalDataUnavailable: row.externalDataUnavailable === true,
  };
}
export type Overview = ReturnType<typeof parseOverview>;
