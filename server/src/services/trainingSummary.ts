type TrainingLog = { completedOn: string; isPr: boolean; amrapReps: number; topSetWeight: number | null };

const dateAt = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
function shift(iso: string, days: number) {
  const date = dateAt(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}
function monday(iso: string) {
  return shift(iso, -((dateAt(iso).getUTCDay() + 6) % 7));
}

/** Calendar-date arithmetic matches the dates stored on workout logs. */
export function buildTrainingSummary(logs: TrainingLog[], today = isoDate(new Date())) {
  const weekStart = monday(today);
  const completed = logs.filter(log => log.completedOn <= today);
  const activeWeeks = new Set(completed.map(log => monday(log.completedOn)));
  let cursor = activeWeeks.has(weekStart) ? weekStart : shift(weekStart, -7);
  let streak = 0;
  while (activeWeeks.has(cursor)) {
    streak++;
    cursor = shift(cursor, -7);
  }
  const thisWeek = completed.filter(log => log.completedOn >= weekStart);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = shift(weekStart, (i - 11) * 7);
    return { start, count: completed.filter(log => log.completedOn >= start && log.completedOn < shift(start, 7)).length };
  });
  return {
    streak,
    weekSessions: thisWeek.length,
    weekPrs: thisWeek.filter(log => log.isPr).length,
    weekReps: thisWeek.reduce((sum, log) => sum + log.amrapReps, 0),
    totalPrs: completed.filter(log => log.isPr).length,
    weeks,
    days: Array.from({ length: 7 }, (_, i) => {
      const date = shift(weekStart, i);
      return { date, label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i], active: completed.some(log => log.completedOn === date), today: date === today };
    }),
  };
}
