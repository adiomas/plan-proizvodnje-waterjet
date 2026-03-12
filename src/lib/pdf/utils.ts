import {
  startOfDay,
  addDays,
  isSameDay,
  isBefore,
  isAfter,
  getISOWeek,
} from "date-fns";
import type { ScheduledOrder } from "../types";
import {
  isWeekend,
  WORKDAY_START,
  WORKDAY_END,
} from "../utils";

/** Segment jednog naloga za jedan dan */
export interface DaySegment {
  order: ScheduledOrder;
  dayStart: Date;
  dayEnd: Date;
  hours: number;
  isContinuation: boolean;
}

const DAY_NAMES_FULL = [
  "NEDJELJA",
  "PONEDJELJAK",
  "UTORAK",
  "SRIJEDA",
  "ČETVRTAK",
  "PETAK",
  "SUBOTA",
];

export function dayNameFull(date: Date): string {
  return DAY_NAMES_FULL[date.getDay()];
}

export function formatDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}.`;
}

export function formatDateShort(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.`;
}

export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatTimePDF(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function weekNumber(date: Date): number {
  return getISOWeek(date);
}

export function getMonday(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

export function formatRokShort(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length < 3) return isoDate;
  return `${parts[2]}.${parts[1]}.`;
}

export function getOrdersForDate(
  orders: ScheduledOrder[],
  date: Date,
  machineId: string
): ScheduledOrder[] {
  const day = startOfDay(date);

  return orders.filter((o) => {
    if (o.order.machine_id !== machineId) return false;
    if (!o.start || !o.end) return false;

    const orderStartDay = startOfDay(o.start);
    const orderEndDay = startOfDay(o.end);

    return (
      isSameDay(orderStartDay, day) ||
      isSameDay(orderEndDay, day) ||
      (isBefore(orderStartDay, day) && isAfter(orderEndDay, day))
    );
  });
}

export function splitOrderByDay(order: ScheduledOrder): DaySegment[] {
  if (!order.start || !order.end) return [];

  const segments: DaySegment[] = [];
  let current = startOfDay(order.start);
  const endDay = startOfDay(order.end);

  while (isBefore(current, endDay) || isSameDay(current, endDay)) {
    if (isWeekend(current)) {
      current = addDays(current, 1);
      continue;
    }

    const isFirstDay = isSameDay(current, startOfDay(order.start));
    const isLastDay = isSameDay(current, endDay);

    const dayStartHour = isFirstDay
      ? order.start.getHours() + order.start.getMinutes() / 60
      : WORKDAY_START;
    const dayEndHour = isLastDay
      ? order.end.getHours() + order.end.getMinutes() / 60
      : WORKDAY_END;

    const hours = dayEndHour - dayStartHour;
    if (hours > 0) {
      const dayStart = new Date(current);
      dayStart.setHours(Math.floor(dayStartHour), (dayStartHour % 1) * 60, 0, 0);
      const dayEnd = new Date(current);
      dayEnd.setHours(Math.floor(dayEndHour), (dayEndHour % 1) * 60, 0, 0);

      segments.push({
        order,
        dayStart,
        dayEnd,
        hours: Math.round(hours * 10) / 10,
        isContinuation: !isFirstDay,
      });
    }

    current = addDays(current, 1);
  }

  return segments;
}

export function getWeekSegments(
  orders: ScheduledOrder[],
  weekStart: Date,
  machineId: string
): Map<string, DaySegment[]> {
  const result = new Map<string, DaySegment[]>();

  for (let i = 0; i < 5; i++) {
    const day = addDays(weekStart, i);
    const key = toLocalDateKey(day);
    result.set(key, []);
  }

  const weekEnd = addDays(weekStart, 4);
  const relevantOrders = orders.filter((o) => {
    if (o.order.machine_id !== machineId) return false;
    if (!o.start || !o.end) return false;
    const orderStartDay = startOfDay(o.start);
    const orderEndDay = startOfDay(o.end);
    return !(isAfter(orderStartDay, weekEnd) || isBefore(orderEndDay, weekStart));
  });

  for (const order of relevantOrders) {
    const segments = splitOrderByDay(order);
    for (const segment of segments) {
      const key = toLocalDateKey(segment.dayStart);
      const dayList = result.get(key);
      if (dayList) {
        dayList.push(segment);
      }
    }
  }

  for (const [, segments] of result) {
    segments.sort((a, b) => a.dayStart.getTime() - b.dayStart.getTime());
  }

  return result;
}
