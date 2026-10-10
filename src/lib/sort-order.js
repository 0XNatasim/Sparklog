// Manual ordering for admin-managed lists (forms, references). Rows are renumbered
// 10, 20, 30… so ties (every row starting at 0) still move correctly; only rows whose
// position actually changed are returned, so a swap is two small updates.
export function moveItem(items, index, delta, idKey = "id") {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [];
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next
    .map((item, position) => ({ id: item[idKey], sort_order: (position + 1) * 10, previous: item.sort_order }))
    .filter((row) => row.sort_order !== row.previous)
    .map(({ id, sort_order }) => ({ id, sort_order }));
}

export function nextSortOrder(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), 0) + 10;
}
