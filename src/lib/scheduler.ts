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

/**
 * Automatsko raspoređivanje — Earliest Deadline First (EDD) s "ne prije" semantikom.
 * Nalozi bez redoslijeda (ima samo najraniji_pocetak ili nema oba) se raspoređuju automatski.
 */
function scheduleAutoOrders(
  autoOrders: WorkOrder[],
  scheduled: ScheduledOrder[],
  machines: Machine[],
  ganttStartDate: Date,
  overrides: MachineOverride[],
  sirovineEnabled = false
): void {
  // EDD: nalozi s hitni_rok ISPRED svih (sortirani po hitni_rok datumu), zatim po roku, null rok na kraj
  const sorted = [...autoOrders].sort((a, b) => {
    const aHasHitniRok = !!a.hitni_rok;
    const bHasHitniRok = !!b.hitni_rok;
    if (aHasHitniRok !== bHasHitniRok) return aHasHitniRok ? -1 : 1;
    if (aHasHitniRok && bHasHitniRok) {
      const aHr = parseISO(a.hitni_rok!).getTime();
      const bHr = parseISO(b.hitni_rok!).getTime();
      if (aHr !== bHr) return aHr - bHr;
    }
    const aDeadline = a.rok_isporuke ? parseISO(a.rok_isporuke).getTime() : Infinity;
    const bDeadline = b.rok_isporuke ? parseISO(b.rok_isporuke).getTime() : Infinity;
    if (aDeadline !== bDeadline) return aDeadline - bDeadline;
    return a.sort_order - b.sort_order;
  });

  const occupiedByMachine = new Map<string, TimeRange[]>();

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

  // Grupiraj split parove
  const splitGroups = new Map<string, WorkOrder[]>();
  for (const o of sorted) {
    if (o.split_group_id) {
      const group = splitGroups.get(o.split_group_id) ?? [];
      group.push(o);
      splitGroups.set(o.split_group_id, group);
    }
  }

  const processedIds = new Set<string>();

  for (const order of sorted) {
    if (processedIds.has(order.id)) continue;

    if (!order.machine_id || order.trajanje_h <= 0) {
      scheduled.push(makeResult(order, null, null, "NEMA RASPOREDA"));
      processedIds.add(order.id);
      continue;
    }

    if (order.split_group_id) {
      const siblings = splitGroups.get(order.split_group_id) ?? [];
      const sibling = siblings.find((o) => o.id !== order.id);

      if (!sibling || !sibling.machine_id || sibling.trajanje_h <= 0) {
        // Sibling nevalidan — rasporedi normalno, sibling bez rasporeda
        const result = scheduleOneAuto(order, ganttStartDate, occupiedByMachine, overrides, sirovineEnabled);
        scheduled.push(result);
        if (result.start && result.end) {
          (occupiedByMachine.get(order.machine_id) ?? []).push({ start: result.start, end: result.end });
        }
        processedIds.add(order.id);
        if (sibling) {
          scheduled.push(makeResult(sibling, null, null, "NEMA RASPOREDA"));
          processedIds.add(sibling.id);
        }
        continue;
      }

      // Odredi sidro: onaj s eksplicitnim najraniji_pocetak, ili prvi po redu
      let anchor = order;
      let partner = sibling;
      if (sibling.najraniji_pocetak && !order.najraniji_pocetak) {
        anchor = sibling;
        partner = order;
      }

      // Rasporedi sidro normalno
      const anchorResult = scheduleOneAuto(anchor, ganttStartDate, occupiedByMachine, overrides, sirovineEnabled);
      scheduled.push(anchorResult);
      if (anchorResult.start && anchorResult.end) {
        (occupiedByMachine.get(anchor.machine_id) ?? []).push({ start: anchorResult.start, end: anchorResult.end });
      }

      // Rasporedi parnjaka nezavisno (bez proximity constrainta)
      let partnerEarliest = ganttStartDate;
      if (partner.hitni_rok) {
        const hrDate = parseISO(partner.hitni_rok);
        if (isAfter(hrDate, partnerEarliest)) partnerEarliest = hrDate;
      }
      if (partner.najraniji_pocetak) {
        const npDate = parseISO(partner.najraniji_pocetak);
        if (isAfter(npDate, partnerEarliest)) partnerEarliest = npDate;
      }

      const partnerOccupied = occupiedByMachine.get(partner.machine_id) ?? [];
      const partnerStart = findEarliestStart(
        partnerEarliest,
        partner.trajanje_h,
        partnerOccupied,
        partner.machine_id,
        overrides
      );
      const partnerEnd = calculateEnd(partnerStart, partner.trajanje_h, partner.machine_id, overrides);
      const partnerStanje = calculateDeadline(partner, partnerEnd);
      const partnerStatus: ScheduleStatus = sirovineEnabled && partner.status_sirovine === "CEKA" ? "ČEKANJE SIROVINE" : "OK";

      scheduled.push(makeResult(partner, partnerStart, partnerEnd, partnerStatus, partnerStanje));
      partnerOccupied.push({ start: partnerStart, end: partnerEnd });

      processedIds.add(anchor.id);
      processedIds.add(partner.id);
    } else {
      // Normalan nalog — bez promjena
      const result = scheduleOneAuto(order, ganttStartDate, occupiedByMachine, overrides, sirovineEnabled);
      scheduled.push(result);
      if (result.start && result.end) {
        (occupiedByMachine.get(order.machine_id) ?? []).push({ start: result.start, end: result.end });
      }
      processedIds.add(order.id);
    }
  }
}

/** Rasporedi jedan auto nalog (izvučena logika za reuse u split parovima) */
function scheduleOneAuto(
  order: WorkOrder,
  ganttStartDate: Date,
  occupiedByMachine: Map<string, TimeRange[]>,
  overrides: MachineOverride[],
  sirovineEnabled: boolean
): ScheduledOrder {
  if (!order.machine_id || order.trajanje_h <= 0) {
    return makeResult(order, null, null, "NEMA RASPOREDA");
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
    return makeResult(order, null, null, "NEMA RASPOREDA");
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
