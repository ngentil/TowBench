// Reorders an array of tab objects {id, ...} by a saved order (array of ids).
// Tabs in savedOrder appear first (preserving availability checks).
// New tabs not in savedOrder are appended at the end.
export function applyTabOrder(tabs, savedOrder) {
  if (!savedOrder?.length) return tabs;
  const tabMap = new Map(tabs.map(t => [t.id, t]));
  const ordered   = savedOrder.filter(id => tabMap.has(id)).map(id => tabMap.get(id));
  const remaining = tabs.filter(t => !savedOrder.includes(t.id));
  return [...ordered, ...remaining];
}
