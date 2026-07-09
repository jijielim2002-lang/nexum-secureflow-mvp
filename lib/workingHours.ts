// Working hours calculator — Malaysia time (MYT = UTC+8)
// Working window: Monday–Friday, 09:00–18:00 MYT
// Public holidays: deferred to v2 (not handled here)

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000; // +08:00 in ms
const WORK_START    = 9;  // 09:00 MYT (inclusive)
const WORK_END      = 18; // 18:00 MYT (exclusive boundary — end of last hour)

/** Return a Date representing the same instant shifted to Malaysia local time for UTC-field inspection. */
function toMYT(utc: Date): Date {
  return new Date(utc.getTime() + MYT_OFFSET_MS);
}

/**
 * Advance `utc` to the next valid working moment (Mon–Fri, 09:00–18:00 MYT).
 * If already inside a working window, returns the same instant.
 */
function snapToWorkingMoment(utc: Date): Date {
  let d = new Date(utc.getTime());

  for (let guard = 0; guard < 14; guard++) {
    const loc  = toMYT(d);
    const dow  = loc.getUTCDay();   // 0=Sun … 6=Sat  (MYT calendar day)
    const hour = loc.getUTCHours(); // 0-23            (MYT hour)

    if (dow === 0) {
      // Sunday → Monday 09:00 MYT
      d = new Date(Date.UTC(loc.getUTCFullYear(), loc.getUTCMonth(), loc.getUTCDate() + 1, WORK_START, 0, 0, 0) - MYT_OFFSET_MS);
      continue;
    }
    if (dow === 6) {
      // Saturday → Monday 09:00 MYT
      d = new Date(Date.UTC(loc.getUTCFullYear(), loc.getUTCMonth(), loc.getUTCDate() + 2, WORK_START, 0, 0, 0) - MYT_OFFSET_MS);
      continue;
    }
    if (hour < WORK_START) {
      // Before 09:00 → same day 09:00 MYT
      d = new Date(Date.UTC(loc.getUTCFullYear(), loc.getUTCMonth(), loc.getUTCDate(), WORK_START, 0, 0, 0) - MYT_OFFSET_MS);
      continue;
    }
    if (hour >= WORK_END) {
      // At or after 18:00 → next calendar day 09:00 MYT (loop re-handles weekends)
      d = new Date(Date.UTC(loc.getUTCFullYear(), loc.getUTCMonth(), loc.getUTCDate() + 1, WORK_START, 0, 0, 0) - MYT_OFFSET_MS);
      continue;
    }
    break; // Valid working moment reached
  }

  return d;
}

/**
 * Calculate the deadline that is exactly `workingHours` Malaysia working hours
 * after `startAt`.
 *
 * Rules:
 * - Working hours = Mon–Fri 09:00–18:00 MYT (9 hours/day)
 * - If `startAt` is outside working hours or on a weekend, the countdown
 *   starts at the next working moment (next Mon–Fri 09:00 if on weekend, or
 *   next 09:00 if before opening, or next-day 09:00 if after closing)
 * - Fractional hours are preserved (e.g. starting at 14:30 means 3.5h remain
 *   that day before the counter must carry over to the next working day)
 *
 * @param startAt      When the clock starts (typically pod_uploaded_at)
 * @param workingHours Number of working hours until auto-confirmation (default 48)
 * @returns            UTC Date of the deadline
 */
export function calculateWorkingHoursDeadline(
  startAt: Date,
  workingHours = 48,
): Date {
  let current   = snapToWorkingMoment(new Date(startAt.getTime()));
  let remaining = workingHours;

  for (let guard = 0; guard < 500 && remaining > 0; guard++) {
    const loc  = toMYT(current);
    const hour = loc.getUTCHours();
    const min  = loc.getUTCMinutes();

    // Fractional hours left in today's window (18:00 - currentTime)
    const hoursLeftToday = WORK_END - hour - min / 60;

    if (remaining <= hoursLeftToday) {
      current = new Date(current.getTime() + remaining * 3_600_000);
      remaining = 0;
    } else {
      // Consume remaining hours today, jump to next working day 09:00
      remaining -= hoursLeftToday;
      const loc2 = toMYT(current);
      const nextDayAt9 = new Date(
        Date.UTC(loc2.getUTCFullYear(), loc2.getUTCMonth(), loc2.getUTCDate() + 1, WORK_START, 0, 0, 0) - MYT_OFFSET_MS,
      );
      current = snapToWorkingMoment(nextDayAt9);
    }
  }

  return current;
}

/**
 * Format the deadline as a human-readable countdown from now.
 * Returns e.g. "3h 20m remaining", "Overdue", "~2 days remaining".
 */
export function fmtWorkingDeadlineCountdown(deadlineUtc: Date): string {
  const diffMs  = deadlineUtc.getTime() - Date.now();
  if (diffMs <= 0) return "Overdue";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60)  return `${diffMin}m remaining`;
  const hrs = Math.floor(diffMin / 60);
  const min = diffMin % 60;
  if (hrs < 24) return `${hrs}h ${min > 0 ? `${min}m ` : ""}remaining`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return `~${days}d ${remHrs > 0 ? `${remHrs}h ` : ""}remaining`;
}

/**
 * Format a UTC ISO string as Malaysia local date-time for display.
 * e.g. "14 Jun 2026, 14:30 MYT"
 */
export function fmtMYT(utcIso: string | Date | null | undefined): string {
  if (!utcIso) return "—";
  const d = typeof utcIso === "string" ? new Date(utcIso) : utcIso;
  return toMYT(d).toUTCString().replace("GMT", "MYT").replace(/:00 MYT$/, " MYT");
}
