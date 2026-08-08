export function isInSchedule(schedule) {
  if (!schedule?.enabled) return true;

  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat

  if (!schedule.days?.includes(day)) return false;

  const mins = now.getHours() * 60 + now.getMinutes();
  const start = schedule.startHour * 60 + (schedule.startMin || 0);
  const end   = schedule.endHour   * 60 + (schedule.endMin   || 0);

  return mins >= start && mins < end;
}

export function scheduleLabel(schedule) {
  if (!schedule?.enabled) return 'Always active';

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = (schedule.days || []).map(d => DAYS[d]).join('/');

  const fmt = (h, m) => {
    const period = h >= 12 ? 'pm' : 'am';
    const hh = h % 12 || 12;
    return m ? `${hh}:${String(m).padStart(2, '0')}${period}` : `${hh}${period}`;
  };

  return `${days} ${fmt(schedule.startHour, schedule.startMin)}–${fmt(schedule.endHour, schedule.endMin)}`;
}
