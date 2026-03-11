import {
  addDays,
  getDay,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
} from "date-fns";

export const WORKDAY_START = 7;
export const WORKDAY_END = 15;
export const HOURS_PER_DAY = 8;

/** Postavi vrijeme na HH:00:00.000 */
export function setTime(date: Date, hours: number, minutes = 0): Date {
  return setMilliseconds(setSeconds(setMinutes(setHours(date, hours), minutes), 0), 0);
}

/** Vrati početak radnog dana (07:00) za dani datum */
export function workdayStart(date: Date): Date {
  return setTime(date, WORKDAY_START);
}

/** Je li dan vikend? (subota=6, nedjelja=0) */
export function isWeekend(date: Date): boolean {
  const day = getDay(date);
  return day === 0 || day === 6;
}

/** Sljedeći radni dan (preskače vikende) */
export function nextWorkday(date: Date): Date {
  let d = addDays(date, 1);
  while (isWeekend(d)) {
    d = addDays(d, 1);
  }
  return d;
}

/**
 * WORKDAY.INTL ekvivalent — preskače vikende.
 * Pomakni se `days` radnih dana unaprijed od `start`.
 */
export function workdayIntl(start: Date, days: number): Date {
  let d = start;
  let remaining = days;
  while (remaining > 0) {
    d = addDays(d, 1);
    if (!isWeekend(d)) {
      remaining--;
    }
  }
  return d;
}

/** Formatiraj datum za prikaz: "pon 11.03." */
export function formatDayDate(date: Date): string {
  const days = ["ned", "pon", "uto", "sri", "čet", "pet", "sub"];
  const dayName = days[getDay(date)];
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dayName} ${dd}.${mm}.`;
}

/** Formatiraj vrijeme: "07:00" */
export function formatTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
