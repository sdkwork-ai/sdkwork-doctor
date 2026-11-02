export function formatTimestamp(iso: string, locale: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(value);
}

export function formatDuration(durationMs: number): string {
  return durationMs < 1 ? 'under 1 ms' : Math.round(durationMs) + ' ms';
}

export function formatCount(count: number, singular: string, plural: string): string {
  return count + ' ' + (count === 1 ? singular : plural);
}
