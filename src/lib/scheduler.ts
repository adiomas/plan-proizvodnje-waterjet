import type {
  WorkOrder,
  Machine,
  MachineOverride,
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
  getWorkingHours,
} from "./utils";
import { startOfDay, parseISO, isBefore, isAfter, addDays } from "date-fns";

/**
 * Scheduling engine s automatskim raspoređivanjem (EDD algoritam).
 *
 * Logika:
 * 1. Ručni nalozi (imaju redoslijed) — raspored kao prije
 * 2. Automatski nalozi (samo najraniji_pocetak ili bez oba) — EDD: sortiraj po roku, sekvencijalno po stroju
 * 3. End-of-day: ako nalog ne stigne do kraja radnog dana, ide na idući radni dan
 * 4. Overlap detekcija po stroju
 * 5. Deadline tracking
 */
export function computeSchedule(
  orders: WorkOrder[],
  machines: Machine[],
  ganttStartDate: Date,
  overrides: MachineOverride[] = [],
  sirovineEnabled = false
): ScheduleResult {
  const sorted = [...orders].sort((a, b) => a.sort_order - b.sort_order);

  // Razdvoji na ručne i automatske naloge
  const manualOrders: WorkOrder[] = [];
  const autoOrders: WorkOrder[] = [];
  const scheduled: ScheduledOrder[] = [];

  for (const order of sorted) {
    // Kad je feature uključen — filtriraj po statusu sirovine
    if (sirovineEnabled) {
      if (order.status_sirovine === null) {
        scheduled.push(makeResult(order, null, null, "NEPROVJERENO"));
        continue;
      }
      if (order.status_sirovine === "NEMA") {
        scheduled.push(makeResult(order, null, null, "NEMA SIROVINE"));
        continue;
      }
    }

    const hasRedoslijed = order.zeljeni_redoslijed !== null;
    // "Ne prije" nalozi (samo najraniji_pocetak, bez redoslijeda) idu u auto pool
    if (hasRedoslijed) {
      manualOrders.push(order);
    } else {
      autoOrders.push(order);
    }
  }

  manualOrders.sort((a, b) => {
    const aR = a.zeljeni_redoslijed ?? Infinity;
    const bR = b.zeljeni_redoslijed ?? Infinity;
    if (aR !== bR) return aR - bR;
    return a.sort_order - b.sort_order;
  });

  for (const order of manualOrders) {
    const result = scheduleManualOrder(order, scheduled, ganttStartDate, overrides, sirovineEnabled);
    scheduled.push(result);
  }

  scheduleAutoOrders(autoOrders, scheduled, machines, ganttStartDate, overrides, sirovineEnabled);

  for (const item of scheduled) {
    if (item.start && item.end && item.order.machine_id) {
      item.overlapCount = countOverlaps(item, scheduled);
      if (item.overlapCount > 0 && item.status === "OK") {
        item.status = "PREKLAPANJE";
      }
    }
  }

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
function toWorkTime(d: Date, machineId: string, overrides: MachineOverride[]): Date {
  let result = d;

  // Preskoči neradne dane (vikende bez overridea)
  for (let i = 0; i < 10; i++) {
    const wh = getWorkingHours(machineId, result, overrides);
    if (wh !== null) {
      // Radni dan — provjeri radno vrijeme
      if (result.getHours() + result.getMinutes() / 60 < wh.start) {
        return setTime(result, wh.start);
      }
      if (result.getHours() + result.getMinutes() / 60 >= wh.end) {
        result = addDays(startOfDay(result), 1);
        continue;
      }
      return result;
    }
    // Neradni dan — sljedeći dan
    result = addDays(startOfDay(result), 1);
  }
  // Fallback: vrati rezultat normaliziran na default start
  return workdayStart(result);
}

/** Nađi najraniji start koji ne kolidira s occupied ranges */
function findEarliestStart(
  earliest: Date,
  durationH: number,
  occupied: TimeRange[],
  machineId: string,
  overrides: MachineOverride[]
): Date {
  const sorted = [...occupied].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  let candidate = toWorkTime(earliest, machineId, overrides);

  for (let attempt = 0; attempt < 500; attempt++) {
    candidate = adjustStartForEOD(candidate, durationH, machineId, overrides);
    candidate = toWorkTime(candidate, machineId, overrides);

    const end = calculateEnd(candidate, durationH, machineId, overrides);

    const conflict = sorted.find(
      (r) => isBefore(r.start, end) && isAfter(r.end, candidate)
    );

    if (!conflict) return candidate;

    candidate = toWorkTime(conflict.end, machineId, overrides);
  }

  return candidate;
}

const HORIZON_DAYS = 30;

/**
 * Automatsko raspoređivanje s planning horizontom.
 *
 * Četiri kategorije:
 * 1. INCOMPLETE (bez stroja/trajanja) → "ČEKA PRIPREMU"
 * 2. CRITICAL (hitni_rok) → forward scheduling ASAP
 * 3. FIRM (rok unutar horizonta 30d) → forward EDD, kompaktno raspoređivanje
 * 4. TENTATIVE (rok izvan horizonta) → backward scheduling blizu roka, status "ZAKAZANO"
 */
function scheduleAutoOrders(
  autoOrders: WorkOrder[],
  scheduled: ScheduledOrder[],
  machines: Machine[],
  ganttStartDate: Date,
  overrides: MachineOverride[],
  sirovineEnabled = false
): void {
  const horizonEnd = addDays(startOfDay(new Date()), HORIZON_DAYS);

  // Kategorizacija
  const critical: WorkOrder[] = [];
  const deadline: WorkOrder[] = [];
  const incomplete: WorkOrder[] = [];

  for (const order of autoOrders) {
    if (!order.machine_id || order.trajanje_h <= 0) {
      incomplete.push(order);
    } else if (order.hitni_rok) {
      critical.push(order);
    } else {
      deadline.push(order);
    }
  }

  // Sortiraj critical po hitni_rok (ascending)
  critical.sort((a, b) => {
    const aHr = parseISO(a.hitni_rok!).getTime();
    const bHr = parseISO(b.hitni_rok!).getTime();
    if (aHr !== bHr) return aHr - bHr;
    return a.sort_order - b.sort_order;
  });

  // Sortiraj deadline po rok_isporuke (ascending) — najhitnije prvo
  deadline.sort((a, b) => {
    const aDeadline = a.rok_isporuke ? parseISO(a.rok_isporuke).getTime() : Infinity;
    const bDeadline = b.rok_isporuke ? parseISO(b.rok_isporuke).getTime() : Infinity;
    if (aDeadline !== bDeadline) return aDeadline - bDeadline;
    return a.sort_order - b.sort_order;
  });

  // Inicijaliziraj occupied ranges iz manual naloga
  const occupiedByMachine = new Map<string, TimeRange[]>();
  for (const m of machines) {
    occupiedByMachine.set(m.id, []);
  }
  for (const item of scheduled) {
    if (item.start && item.end && item.order.machine_id) {
      occupiedByMachine.get(item.order.machine_id)?.push({
        start: item.start,
        end: item.end,
      });
    }
  }

  // Incomplete nalozi — "ČEKA PRIPREMU"
  for (const order of incomplete) {
    scheduled.push(makeResult(order, null, null, "ČEKA PRIPREMU"));
  }

  // Forward schedule CRITICAL naloge
  for (const order of critical) {
    const result = scheduleOneForward(order, ganttStartDate, occupiedByMachine, overrides, sirovineEnabled);
    scheduled.push(result);
    if (result.start && result.end && order.machine_id) {
      (occupiedByMachine.get(order.machine_id) ?? []).push({
        start: result.start,
        end: result.end,
      });
    }
  }

  // Podijeli deadline naloge na FIRM (unutar horizonta) i TENTATIVE (izvan horizonta)
  const firm: WorkOrder[] = [];
  const tentative: WorkOrder[] = [];

  for (const order of deadline) {
    if (!order.rok_isporuke) {
      // Bez roka — forward EDD (firm)
      firm.push(order);
      continue;
    }

    const deadlineDate = parseISO(order.rok_isporuke);

    if (!isAfter(deadlineDate, horizonEnd)) {
      // Rok unutar horizonta — firm
      firm.push(order);
    } else {
      // Safety check: dug nalog čiji latestStart pada unutar horizonta
      const mustFinishBy = prevWorkday(prevWorkday(deadlineDate));
      const wh = getWorkingHours(order.machine_id, mustFinishBy, overrides);
      const endHour = wh ? wh.end : WORKDAY_END;
      const latestStart = calculateStartFromEnd(
        setTime(mustFinishBy, 0, endHour * 60),
        order.trajanje_h,
        order.machine_id,
        overrides
      );
      if (isBefore(latestStart, horizonEnd)) {
        firm.push(order);
      } else {
        tentative.push(order);
      }
    }
  }

  // FIRM: Forward EDD za naloge unutar horizonta (kompaktno)
  for (const order of firm) {
    const result = scheduleOneForward(order, ganttStartDate, occupiedByMachine, overrides, sirovineEnabled);
    scheduled.push(result);
    if (result.start && result.end && order.machine_id) {
      (occupiedByMachine.get(order.machine_id) ?? []).push({
        start: result.start,
        end: result.end,
      });
    }
  }

  // TENTATIVE: Backward scheduling za daleke naloge (blizu roka, status "ZAKAZANO")
  for (const order of tentative) {
    const deadlineDate = parseISO(order.rok_isporuke!);
    const mustFinishBy = prevWorkday(prevWorkday(deadlineDate));
    const occupied = occupiedByMachine.get(order.machine_id) ?? [];

    const start = findLatestStart(
      mustFinishBy,
      order.trajanje_h,
      occupied,
      order.machine_id,
      overrides,
      ganttStartDate
    );

    if (start) {
      const end = calculateEnd(start, order.trajanje_h, order.machine_id, overrides);
      const stanje = calculateDeadline(order, end);
      scheduled.push(makeResult(order, start, end, "ZAKAZANO", stanje));
      (occupiedByMachine.get(order.machine_id) ?? []).push({ start, end });
    } else {
      // Fallback: forward scheduling
      const result = scheduleOneForward(order, ganttStartDate, occupiedByMachine, overrides, sirovineEnabled);
      result.status = "ZAKAZANO";
      scheduled.push(result);
      if (result.start && result.end && order.machine_id) {
        (occupiedByMachine.get(order.machine_id) ?? []).push({
          start: result.start,
          end: result.end,
        });
      }
    }
  }
}

/** Rasporedi jedan auto nalog forward (izvučena logika za reuse) */
function scheduleOneForward(
  order: WorkOrder,
  ganttStartDate: Date,
  occupiedByMachine: Map<string, TimeRange[]>,
  overrides: MachineOverride[],
  sirovineEnabled: boolean
): ScheduledOrder {
  if (!order.machine_id || order.trajanje_h <= 0) {
    return makeResult(order, null, null, order.machine_id ? "NEMA RASPOREDA" : "ČEKA PRIPREMU");
  }

  const occupied = occupiedByMachine.get(order.machine_id) ?? [];

  let earliest = ganttStartDate;
  if (order.hitni_rok) {
    const hrDate = parseISO(order.hitni_rok);
    if (isAfter(hrDate, earliest)) earliest = hrDate;
  }
  if (order.najraniji_pocetak) {
    const npDate = parseISO(order.najraniji_pocetak);
    if (isAfter(npDate, earliest)) earliest = npDate;
  }

  const start = findEarliestStart(earliest, order.trajanje_h, occupied, order.machine_id, overrides);
  const end = calculateEnd(start, order.trajanje_h, order.machine_id, overrides);
  const stanje = calculateDeadline(order, end);
  const baseStatus: ScheduleStatus = sirovineEnabled && order.status_sirovine === "CEKA" ? "ČEKANJE SIROVINE" : "OK";

  return makeResult(order, start, end, baseStatus, stanje);
}

/**
 * Izračunaj start datum backward od end datuma.
 * Inverz calculateEnd() — radi od kraja prema početku.
 */
function calculateStartFromEnd(
  end: Date,
  durationH: number,
  machineId: string,
  overrides: MachineOverride[]
): Date {
  const h = Number(durationH);
  const wh = getWorkingHours(machineId, end, overrides);
  if (!wh) return end; // fallback

  const endHour = end.getHours() + end.getMinutes() / 60;

  // Stane u isti radni dan?
  if (endHour - h >= wh.start) {
    return setTime(end, 0, (endHour - h) * 60);
  }

  // Multi-day backward: oduzimaj dane unatrag
  let remaining = h - (endHour - wh.start);
  let current = addDays(startOfDay(end), -1);

  for (let i = 0; i < 500; i++) {
    const dayWh = getWorkingHours(machineId, current, overrides);
    if (dayWh === null) {
      current = addDays(current, -1);
      continue;
    }

    if (remaining <= dayWh.hours) {
      return setTime(current, 0, (dayWh.end - remaining) * 60);
    }

    remaining -= dayWh.hours;
    current = addDays(current, -1);
  }

  return workdayStart(current);
}

/**
 * Nađi najkasniji slobodni slot koji završava prije mustFinishBy.
 * Vraća start datum ili null ako nema mjesta.
 */
function findLatestStart(
  mustFinishBy: Date,
  durationH: number,
  occupied: TimeRange[],
  machineId: string,
  overrides: MachineOverride[],
  ganttStartDate: Date
): Date | null {
  const sorted = [...occupied].sort(
    (a, b) => b.start.getTime() - a.start.getTime() // sortirano od najkasnijeg
  );

  // End target = kraj radnog dana na mustFinishBy datumu
  const whFinish = getWorkingHours(machineId, mustFinishBy, overrides);
  let endTarget = whFinish
    ? setTime(mustFinishBy, 0, whFinish.end * 60)
    : setTime(mustFinishBy, WORKDAY_END);

  for (let attempt = 0; attempt < 500; attempt++) {
    const startCandidate = calculateStartFromEnd(endTarget, durationH, machineId, overrides);

    // Ne može ići prije ganttStartDate (danas)
    if (isBefore(startCandidate, ganttStartDate)) {
      return null;
    }

    const candidateEnd = calculateEnd(startCandidate, durationH, machineId, overrides);

    // Provjeri koliziju s occupied ranges
    const conflict = sorted.find(
      (r) => isBefore(r.start, candidateEnd) && isAfter(r.end, startCandidate)
    );

    if (!conflict) {
      return startCandidate;
    }

    // Pomakni endTarget prije konflikta
    endTarget = conflict.start;

    // Normaliziraj na radno vrijeme (kraj prethodnog radnog perioda)
    const whConflict = getWorkingHours(machineId, endTarget, overrides);
    if (whConflict) {
      const conflictHour = endTarget.getHours() + endTarget.getMinutes() / 60;
      if (conflictHour <= whConflict.start) {
        // Konflikt počinje na početku dana — idi na prethodni radni dan
        let prev = addDays(startOfDay(endTarget), -1);
        for (let j = 0; j < 10; j++) {
          const prevWh = getWorkingHours(machineId, prev, overrides);
          if (prevWh) {
            endTarget = setTime(prev, 0, prevWh.end * 60);
            break;
          }
          prev = addDays(prev, -1);
        }
      }
    } else {
      // Neradni dan — idi unatrag
      let prev = addDays(startOfDay(endTarget), -1);
      for (let j = 0; j < 10; j++) {
        const prevWh = getWorkingHours(machineId, prev, overrides);
        if (prevWh) {
          endTarget = setTime(prev, 0, prevWh.end * 60);
          break;
        }
        prev = addDays(prev, -1);
      }
    }
  }

  return null;
}

/** End-of-day provjera: vraća start nepromijenjeno — calculateEnd rješava multi-day split */
function adjustStartForEOD(
  start: Date,
  durationH: number,
  machineId: string,
  overrides: MachineOverride[]
): Date {
  const wh = getWorkingHours(machineId, start, overrides);
  if (!wh) return start; // neradni dan — ne bi trebalo doći ovdje

  const startHour = start.getHours() + start.getMinutes() / 60;

  if (startHour + durationH <= wh.end) {
    return start;
  }

  // Ne stane danas — pusti da calculateEnd splitta preko dana
  return start;
}

/**
 * Ručno raspoređivanje — samo redoslijed nalozi sada.
 * Nalozi s samo najraniji_pocetak su premješteni u auto pool s "ne prije" semantikom.
 */
function scheduleManualOrder(
  order: WorkOrder,
  previouslyScheduled: ScheduledOrder[],
  ganttStartDate: Date,
  overrides: MachineOverride[],
  sirovineEnabled = false
): ScheduledOrder {
  const hasRedoslijed = order.zeljeni_redoslijed !== null;
  const hasPocetak = order.najraniji_pocetak !== null;
  const hasMachine = !!order.machine_id;
  const hasTrajanje = order.trajanje_h > 0;

  // Input error: oba scheduling polja popunjena (ne bi trebalo doći ovdje, ali safety check)
  if (hasRedoslijed && hasPocetak) {
    return makeResult(order, null, null, "GREŠKA UNOSA");
  }

  if (!hasMachine || !hasTrajanje) {
    return makeResult(order, null, null, !hasMachine ? "ČEKA PRIPREMU" : "NEMA RASPOREDA");
  }

  let start: Date | null = null;

  if (hasRedoslijed) {
    const redoslijed = order.zeljeni_redoslijed!;
    if (redoslijed === 1) {
      start = toWorkTime(workdayStart(ganttStartDate), order.machine_id, overrides);
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
        start = toWorkTime(workdayStart(ganttStartDate), order.machine_id, overrides);
      }
    }
  }

  if (!start) {
    return makeResult(order, null, null, "NEMA RASPOREDA");
  }

  start = adjustStartForEOD(start, order.trajanje_h, order.machine_id, overrides);
  start = toWorkTime(start, order.machine_id, overrides);

  const end = calculateEnd(start, order.trajanje_h, order.machine_id, overrides);
  const stanje = calculateDeadline(order, end);
  const baseStatus: ScheduleStatus = sirovineEnabled && order.status_sirovine === "CEKA" ? "ČEKANJE SIROVINE" : "OK";

  return makeResult(order, start, end, baseStatus, stanje);
}

/** Izračunaj end datetime s multi-day overflow respektujući dinamičko radno vrijeme */
function calculateEnd(
  start: Date,
  hours: number,
  machineId: string,
  overrides: MachineOverride[]
): Date {
  const h = Number(hours); // defensive — Supabase numeric dolazi kao string
  const wh = getWorkingHours(machineId, start, overrides);
  if (!wh) return start; // fallback

  const startHour = start.getHours() + start.getMinutes() / 60;

  // Stane u ovaj radni dan?
  if (startHour + h <= wh.end) {
    return setTime(start, 0, (startHour + h) * 60);
  }

  // Multi-day: oduzimaj dane dok ne potrošiš sve sate
  let remaining = h - (wh.end - startHour);
  let current = addDays(startOfDay(start), 1);

  for (let i = 0; i < 500; i++) {
    const dayWh = getWorkingHours(machineId, current, overrides);
    if (dayWh === null) {
      // Neradni dan — preskoči
      current = addDays(current, 1);
      continue;
    }

    if (remaining <= dayWh.hours) {
      // Završava ovaj dan
      return setTime(current, 0, (dayWh.start + remaining) * 60);
    }

    remaining -= dayWh.hours;
    current = addDays(current, 1);
  }

  // Fallback
  return setTime(current, WORKDAY_END);
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
  if (!order.rok_isporuke) return end ? "BEZ ROKA" : null;

  const deadline = parseISO(order.rok_isporuke);
  const deadlineDay = startOfDay(deadline);
  const today = startOfDay(new Date());

  // Rok je već istekao ili ističe danas
  if (!isAfter(deadlineDay, today)) {
    return "ROK ISTEKAO";
  }

  if (!end) return null;
  const endDay = startOfDay(end);
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
