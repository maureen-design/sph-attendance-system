import { AttendanceStatus } from '@prisma/client';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * Parses a "HH:mm" time string into hours and minutes.
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: h, minutes: m };
}

/**
 * Builds a Date for today (in the given timezone) at the specified HH:mm.
 * Returns a UTC Date.
 */
function buildTimeOnDate(date: Date, timeStr: string, timezone: string): Date {
  const { hours, minutes } = parseTime(timeStr);
  const zoned = toZonedTime(date, timezone);
  zoned.setHours(hours, minutes, 0, 0);
  // Convert back: create a UTC date from the zoned components
  const utcStr = format(zoned, "yyyy-MM-dd'T'HH:mm:ss");
  return new Date(utcStr + 'Z');
}

/**
 * Calculates attendance status based on check-in time and department rules.
 * Pure function — no DB calls.
 */
export function calculateAttendanceStatus(
  checkInTime: Date | null,
  departmentShiftStart: string,
  cutoffTime: string,
  gracePeriodMins: number,
  orgTimezone: string,
): AttendanceStatus {
  if (!checkInTime) {
    return 'UNRESOLVED';
  }

  const shiftStartUtc = buildTimeOnDate(checkInTime, departmentShiftStart, orgTimezone);
  const cutoffUtc = buildTimeOnDate(checkInTime, cutoffTime, orgTimezone);

  // Early threshold: 15 minutes before shift start
  const earlyThresholdMs = 15 * 60 * 1000;
  const earlyThreshold = new Date(shiftStartUtc.getTime() - earlyThresholdMs);

  // Grace end: shift start + grace period
  const graceEnd = new Date(shiftStartUtc.getTime() + gracePeriodMins * 60 * 1000);

  const checkInMs = checkInTime.getTime();

  // Before early threshold → EARLY
  if (checkInMs < earlyThreshold.getTime()) {
    return 'EARLY';
  }

  // Within shift start + grace → ON_TIME
  if (checkInMs >= earlyThreshold.getTime() && checkInMs <= graceEnd.getTime()) {
    return 'ON_TIME';
  }

  // After grace but before cutoff → LATE
  if (checkInMs > graceEnd.getTime() && checkInMs <= cutoffUtc.getTime()) {
    return 'LATE';
  }

  // After cutoff → LATE (supervisor can override)
  return 'LATE';
}

/**
 * Calculates check-out status.
 */
export function calculateCheckOutStatus(
  checkOutTime: Date,
  shiftEnd: string,
  orgTimezone: string,
): 'LEFT_EARLY' | 'ON_TIME_CHECKOUT' {
  const shiftEndUtc = buildTimeOnDate(checkOutTime, shiftEnd, orgTimezone);
  return checkOutTime.getTime() < shiftEndUtc.getTime() ? 'LEFT_EARLY' : 'ON_TIME_CHECKOUT';
}
