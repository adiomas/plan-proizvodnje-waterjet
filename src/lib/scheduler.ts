import type {
  WorkOrder,
  Machine,
  ScheduledOrder,
  ScheduleResult,
  ScheduleStatus,
  DeadlineStatus,
} from "./types";
import {
  WORKDAY_START,
  WORKDAY_END,
  HOURS_PER_DAY,
  setTime,
  isWeekend,
  workdayIntl,
  workdayStart,
  nextWorkday,
  prevWorkday,
} from "./utils";
import { startOfDay, parseISO, isBefore, isAfter } from "date-fns";

/**
 * Scheduling engine s automatskim raspoređivanjem (EDD algoritam).
 *
 * Logika:
 * 1. Ručni nalozi (imaju redoslijed ILI početak) — raspored kao prije
 * 2. Automatski nalozi (nemaju ni jedno) — EDD: sortiraj po roku, sekvencijalno po stroju
 * 3. End-of-day: ako nalog ne stigne do 15:00, ide na idući radni dan 07:00
 * 4. Overlap detekcija po stroju
 * 5. Deadline tracking
 */
export function computeSchedule(
  orders: WorkOrder[],
  machines: Machine[],
  ganttStartDate: Date
): ScheduleResult {
  const sorted = [...orders].sort((a, b) => a.sort_order - b.sort_order);

  // Razdvoji na ručne i automatske naloge
  const manualOrders: WorkOrder[] = [];
  const autoOrders: WorkOrder[] = [];

  for (const order of sorted) {
    const hasRedoslijed = order.zeljeni_redoslijed !== null;
    const hasPocetak = order.najraniji_pocetak !== null;
    if (hasRedoslijed || hasPocetak) {
      manualOrders.push(order);
    } else {
      autoOrders.push(order);
    }
  }

  // Sortiraj ručne naloge: redoslijed nalozi prvo (po redoslijedu asc), pa najraniji_pocetak nalozi
  manualOrders.sort((a, b) => {
    const aR = a.zeljeni_redoslijed ?? Infinity;
    const bR = b.zeljeni_redoslijed ?? Infinity;
    if (aR !== bR) return aR - bR;
    return a.sort_order - b.sort_order;
  });

  // 1. Rasporedi ručne naloge (postojeća logika)
  const scheduled: ScheduledOrder[] = [];
  for (const order of manualOrders) {
    const result = scheduleManualOrder(order, scheduled, ganttStartDate);
    scheduled.push(result);
  }

  // 2. Rasporedi automatske naloge (EDD algoritam)
  scheduleAutoOrders(autoOrders, scheduled, machines, ganttStartDate);

  // 3. Overlap detekcija — mora biti nakon svih izračuna
  for (const item of scheduled) {
    if (item.start && item.end && item.order.machine_id) {
      item.overlapCount = countOverlaps(item, scheduled);
      if (item.overlapCount > 0 && item.status === "OK") {
        item.status = "PREKLAPANJE";
      }
    }
  }

  // Grupiraj po stroju
  const byMachine = new Map<string, ScheduledOrder[]>();
  for (const m of machines) {
    byMachine.set(m.id, []);
  }
  for (const item of scheduled) {
    const list = byMachine.get(item.order.machine_id);
    if (list) list.push(item);
  }

  return { scheduled, byMachine };
}

interface TimeRange {
  start: Date;
  end: Date;
}

/** Osiguraj da je datum u validnom radnom vremenu */
function toWorkTime(d: Date): Date {
  let result = d;
  while (isWeekend(result)) {
    result = workdayStart(nextWorkday(result));
  }
  if (result.getHours() < WORKDAY_START) return workdayStart(result);
  if (result.getHours() >= WORKDAY_END) return workdayStart(nextWorkday(result));
  return result;
}

/** Nađi najraniji start koji ne kolidira s occupied ranges */
function findEarliestStart(
  earliest: Date,
  durationH: number,
  occupied: TimeRange[]
): Date {
  const sorted = [...occupied].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  let candidate = toWorkTime(earliest);

  for (let attempt = 0; attempt < 500; attempt++) {
    candidate = adjustStartForEOD(candidate, durationH);
    candidate = toWorkTime(candidate);

    const end = calculateEnd(candidate, durationH);

    const conflict = sorted.find(
      (r) => isBefore(r.start, end) && isAfter(r.end, candidate)
    );

    if (!conflict) return candidate;

    // Preskoči conflict
    candidate = toWorkTime(conflict.end);
  }

  return candidate; // fallback
}

/**
 * Automatsko raspoređivanje — Earliest Deadline First (EDD) s gap-filling.
 * Nalozi bez ručnog redoslijeda/početka se raspoređuju automatski.
 * Gap-aware: popunjava praznine PRIJE pinuanih naloga umjesto da sve gura iza.
 */
function scheduleAutoOrders(
  autoOrders: WorkOrder[],
  scheduled: ScheduledOrder[],
  machines: Machine[],
  ganttStartDate: Date
): void {
  // Sortiraj po roku isporuke (najhitniji prvo), pa po sort_order
  const sorted = [...autoOrders].sort((a, b) => {
    const aDeadline = a.rok_isporuke ? parseISO(a.rok_isporuke).getTime() : Infinity;
    const bDeadline = b.rok_isporuke ? parseISO(b.rok_isporuke).getTime() : Infinity;
    if (aDeadline !== bDeadline) return aDeadline - bDeadline;
    return a.sort_order - b.sort_order;
  });

  const occupiedByMachine = new Map<string, TimeRange[]>();
  let ganttStart = workdayStart(ganttStartDate);
  while (isWeekend(ganttStart)) {
    ganttStart = workdayStart(nextWorkday(ganttStart));
  }

  for (const m of machines) {
    occupiedByMachine.set(m.id, []);
  }

  // Prikupi zauzete intervale iz manual naloga
  for (const item of scheduled) {
    if (item.start && item.end && item.order.machine_id) {
      occupiedByMachine.get(item.order.machine_id)?.push({
        start: item.start,
        end: item.end,
      });
    }
  }

  // Rasporedi auto-naloge s gap-filling
  for (const order of sorted) {
    if (!order.machine_id || order.trajanje_h <= 0) {
      scheduled.push(makeResult(order, null, null, "NEMA RASPOREDA"));
      continue;
    }

    const occupied = occupiedByMachine.get(order.machine_id) ?? [];
    const start = findEarliestStart(ganttStart, order.trajanje_h, occupied);
    const end = calculateEnd(start, order.trajanje_h);
    const stanje = calculateDeadline(order, end);

    scheduled.push(makeResult(order, start, end, "OK", stanje));
    occupied.push({ start, end });
  }
}

/**
 * End-of-day provjera: ako nalog ne može završiti do 15:00
 * i stane u 1 radni dan (≤8h), pomakni na idući radni dan 07:00.
 * Ako traje više od 8h, počni od trenutnog vremena (overflow normalno).
 */
function adjustStartForEOD(start: Date, durationH: number): Date {
  const startHour = start.getHours() + start.getMinutes() / 60;

  // Ako stane do kraja radnog dana — OK
  if (startHour + durationH <= WORKDAY_END) {
    return start;
  }

  // Ako nalog traje ≤8h ali ne stane danas — pomakni na idući radni dan
  if (durationH <= HOURS_PER_DAY) {
    return workdayStart(nextWorkday(start));
  }

  // Ako traje >8h — počni od sada, overflow se rješava u calculateEnd
  return start;
}

/**
 * Ručno raspoređivanje — originalna logika za naloge s redoslijedom ili početkom.
 */
function scheduleManualOrder(
  order: WorkOrder,
  previouslyScheduled: ScheduledOrder[],
  ganttStartDate: Date
): ScheduledOrder {
  const hasRedoslijed = order.zeljeni_redoslijed !== null;
  const hasPocetak = order.najraniji_pocetak !== null;
  const hasMachine = !!order.machine_id;
  const hasTrajanje = order.trajanje_h > 0;

  // Input error: oba scheduling polja popunjena
  if (hasRedoslijed && hasPocetak) {
    return makeResult(order, null, null, "GREŠKA UNOSA");
  }

  if (!hasMachine || !hasTrajanje) {
    return makeResult(order, null, null, "NEMA RASPOREDA");
  }

  let start: Date | null = null;

  if (hasPocetak) {
    const date = parseISO(order.najraniji_pocetak!);
    let earliest = workdayStart(date);
    while (isWeekend(earliest)) {
      earliest = workdayStart(
        new Date(earliest.getTime() + 24 * 60 * 60 * 1000)
      );
    }

    // Prikupi zauzete intervale na istom stroju iz prethodno raspoređenih naloga
    const occupied: TimeRange[] = [];
    if (order.machine_id) {
      for (const prev of previouslyScheduled) {
        if (prev.order.machine_id === order.machine_id && prev.start && prev.end) {
          occupied.push({ start: prev.start, end: prev.end });
        }
      }
    }

    start = findEarliestStart(earliest, order.trajanje_h, occupied);
  } else if (hasRedoslijed) {
    const redoslijed = order.zeljeni_redoslijed!;
    if (redoslijed === 1) {
      start = workdayStart(ganttStartDate);
      while (isWeekend(start)) {
        start = workdayStart(
          new Date(start.getTime() + 24 * 60 * 60 * 1000)
        );
      }
    } else {
      const prevOnMachine = previouslyScheduled
        .filter(
          (s) =>
            s.order.machine_id === order.machine_id &&
            s.order.zeljeni_redoslijed !== null &&
            s.order.zeljeni_redoslijed < redoslijed &&
            s.end !== null
        )
        .sort(
          (a, b) =>
            (b.order.zeljeni_redoslijed ?? 0) -
            (a.order.zeljeni_redoslijed ?? 0)
        );

      if (prevOnMachine.length > 0 && prevOnMachine[0].end) {
        start = prevOnMachine[0].end;
      } else {
        start = workdayStart(ganttStartDate);
        while (isWeekend(start)) {
          start = workdayStart(
            new Date(start.getTime() + 24 * 60 * 60 * 1000)
          );
        }
      }
    }
  }

  if (!start) {
    return makeResult(order, null, null, "NEMA RASPOREDA");
  }

  // End-of-day provjera i za ručne naloge
  start = adjustStartForEOD(start, order.trajanje_h);

  const end = calculateEnd(start, order.trajanje_h);
  const stanje = calculateDeadline(order, end);

  return makeResult(order, start, end, "OK", stanje);
}

/**
 * Izračunaj end datetime s multi-day overflow i preskakanjem vikenda.
 */
function calculateEnd(start: Date, hours: number): Date {
  const startHour = start.getHours() + start.getMinutes() / 60;

  // Stane u jedan radni dan?
  if (startHour + hours <= WORKDAY_END) {
    return setTime(start, 0, (startHour + hours) * 60);
  }

  // Multi-day overflow
  const remainingToday = WORKDAY_END - startHour;
  const overflow = hours - remainingToday;
  const fullDays = Math.floor(overflow / HOURS_PER_DAY);
  const remainingHours = overflow % HOURS_PER_DAY;

  if (remainingHours === 0) {
    const endDate = workdayIntl(startOfDay(start), fullDays);
    return setTime(endDate, WORKDAY_END);
  }

  const endDate = workdayIntl(startOfDay(start), fullDays + 1);
  return setTime(endDate, WORKDAY_START + remainingHours);
}

/**
 * Broji naloge na istom stroju s preklapajućim vremenskim rasponom.
 */
function countOverlaps(
  item: ScheduledOrder,
  all: ScheduledOrder[]
): number {
  if (!item.start || !item.end) return 0;

  let count = 0;
  for (const other of all) {
    if (other === item) continue;
    if (other.order.machine_id !== item.order.machine_id) continue;
    if (!other.start || !other.end) continue;
    if (isBefore(other.start, item.end) && isAfter(other.end, item.start)) {
      count++;
    }
  }
  return count;
}

function calculateDeadline(
  order: WorkOrder,
  end: Date | null
): DeadlineStatus {
  if (!order.rok_isporuke || !end) return null;
  const deadline = parseISO(order.rok_isporuke);
  const endDay = startOfDay(end);
  const deadlineDay = startOfDay(deadline);
  const bufferDay = startOfDay(prevWorkday(deadline));

  if (isAfter(endDay, deadlineDay)) return "KASNI";
  if (isAfter(endDay, bufferDay)) return "KRITIČNO";
  return "NA VRIJEME";
}

function makeResult(
  order: WorkOrder,
  start: Date | null,
  end: Date | null,
  status: ScheduleStatus,
  stanje: DeadlineStatus = null,
  overlapCount = 0
): ScheduledOrder {
  return { order, start, end, status, stanje, overlapCount };
}
