/**
 * Server timezone for daily message / Chat Star day buckets.
 * Community is US Central — UTC midnight was resetting `!ltop` at 7pm local.
 */
export const DAILY_RESET_TZ =
  process.env.DAILY_RESET_TZ?.trim() || "America/Chicago";

/** UTC calendar date YYYY-MM-DD (weekly boards / legacy). */
export function utcDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Calendar date YYYY-MM-DD in the daily-reset timezone
 * (used by `!ltop`, daily message counts, Chat Star awards).
 */
export function dailyDateString(
  date = new Date(),
  timeZone: string = DAILY_RESET_TZ,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Previous calendar date in the daily-reset timezone. */
export function previousDailyDateString(
  date = new Date(),
  timeZone: string = DAILY_RESET_TZ,
): string {
  const today = dailyDateString(date, timeZone);
  const [y, m, d] = today.split("-").map(Number);
  const pivot = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  pivot.setUTCDate(pivot.getUTCDate() - 1);
  return dailyDateString(pivot, timeZone);
}

/** @deprecated Prefer previousDailyDateString — kept for call-site clarity. */
export function previousUtcDateString(date = new Date()): string {
  return previousDailyDateString(date);
}

/** Ms until the next local midnight in the daily-reset timezone. */
export function msUntilNextDailyReset(
  now = new Date(),
  timeZone: string = DAILY_RESET_TZ,
): number {
  const today = dailyDateString(now, timeZone);
  let lo = now.getTime();
  let hi = lo + 36 * 60 * 60_000;
  while (hi - lo > 250) {
    const mid = Math.floor((lo + hi) / 2);
    if (dailyDateString(new Date(mid), timeZone) === today) lo = mid;
    else hi = mid;
  }
  return Math.max(1_000, hi - now.getTime());
}

/** UTC week id = Monday's YYYY-MM-DD (week starts Monday UTC). */
export function utcWeekId(date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay(); // 0 = Sun … 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Week id for the UTC week that ended most recently (always the prior Monday). */
export function previousUtcWeekId(date = new Date()): string {
  return utcWeekId(new Date(date.getTime() - 7 * 24 * 60 * 60_000));
}

/** Start of the current UTC week (Monday 00:00:00.000Z). */
export function utcWeekStart(date = new Date()): Date {
  return new Date(`${utcWeekId(date)}T00:00:00.000Z`);
}

/** Next Monday 00:00 UTC (when weekly boards reset). */
export function nextUtcWeekStart(date = new Date()): Date {
  const start = utcWeekStart(date);
  return new Date(start.getTime() + 7 * 24 * 60 * 60_000);
}

export function msUntilNextUtcWeek(date = new Date()): number {
  return Math.max(0, nextUtcWeekStart(date).getTime() - date.getTime());
}

/** Human-readable Sunday end date for a UTC week id (Monday `YYYY-MM-DD`). */
export function formatUtcWeekEnding(weekMondayId: string): string {
  const monday = new Date(`${weekMondayId}T00:00:00.000Z`);
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60_000);
  return sunday.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Socialize-style countdown: `1 day, 1 hour and 42 minutes`
 * (omits seconds when ≥ 1 hour).
 */
export function formatResetCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000));
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours > 0 || days > 0) {
    parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  }
  parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]} and ${parts[2]}`;
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
