import { addDays, startOfDay, parseISO, differenceInCalendarDays, format } from "date-fns";
import type {
  WorkOrder,
  Machine,
  MachineOverride,
  ScheduledOrder,
  OvertimeSuggestion,
  OvertimeSuggestionResult,
  OvertimeShiftType,
} from "./types";
import { isWeekend, getWorkingHours, WORKDAY_END } from "./utils";
import { computeSchedule } from "./scheduler";

interface Candidate {
  machine_id: string;
  machine_name: string;
  date: string;
  shift_type: OvertimeShiftType;
  work_start: string;
  work_end: string;
  hours_gained: number;
}

/** Generiraj kandidatske dane za prekovremeni rad na jednom stroju */
function generateCandidates(
  machineId: string,
  machineName: string,
  fromDate: Date,
  toDate: Date,
  existingOverrides: MachineOverride[]
): Candidate[] {
  const candidates: Candidate[] = [];
  const today = startOfDay(new Date());
  const start = fromDate < today ? today : fromDate;

  let d = start;
  while (d <= toDate) {
    const dateStr = format(d, "yyyy-MM-dd");

    // Preskoči dane koji već imaju override za ovaj stroj
    const hasOverride = existingOverrides.some(
      (o) => o.machine_id === machineId && o.date === dateStr
    );

    if (!hasOverride) {
      if (isWeekend(d)) {
        // Vikend: puni dan 07:00-15:00
        candidates.push({
          machine_id: machineId,
          machine_name: machineName,
          date: dateStr,
          shift_type: "weekend_full",
          work_start: "07:00",
          work_end: "15:00",
          hours_gained: 8,
        });
      } else {
        // Radni dan: večernja smjena 15:00-22:00
        candidates.push({
          machine_id: machineId,
          machine_name: machineName,
          date: dateStr,
          shift_type: "weekday_evening",
          work_start: `${WORKDAY_END}:00`,
          work_end: "22:00",
          hours_gained: 7,
        });
      }
    }

    d = addDays(d, 1);
  }

  return candidates;
}

/** Prebroji kasne/kritične naloge po stroju */
function countLateOrders(
  scheduled: ScheduledOrder[]
): { lateIds: Set<string>; byMachine: Map<string, string[]> } {
  const lateIds = new Set<string>();
  const byMachine = new Map<string, string[]>();

  for (const s of scheduled) {
    if (s.stanje === "KASNI" || s.stanje === "KRITIČNO") {
      lateIds.add(s.order.id);
      const arr = byMachine.get(s.order.machine_id) || [];
      arr.push(s.order.id);
      byMachine.set(s.order.machine_id, arr);
    }
  }

  return { lateIds, byMachine };
}

/** Ocijeni kandidata: koliko naloga popravi */
function evaluateCandidate(
  candidate: Candidate,
  orders: WorkOrder[],
  machines: Machine[],
  ganttStartDate: Date,
  baseOverrides: MachineOverride[],
  sirovineEnabled: boolean,
  currentLateIds: Set<string>
): { ordersFixed: string[]; score: number } {
  // Kreiraj privremeni override
  const tempOverride: MachineOverride = {
    id: "temp",
    user_id: "temp",
    machine_id: candidate.machine_id,
    date: candidate.date,
    work_start: candidate.work_start,
    work_end: candidate.work_end,
    created_at: "",
  };

  const result = computeSchedule(
    orders,
    machines,
    ganttStartDate,
    [...baseOverrides, tempOverride],
    sirovineEnabled
  );

  // Pronađi koji su nalozi postali NA VRIJEME
  const ordersFixed: string[] = [];
  for (const s of result.scheduled) {
    if (currentLateIds.has(s.order.id)) {
      if (s.stanje === "NA VRIJEME" || s.stanje === "BEZ ROKA") {
        ordersFixed.push(s.order.rn_id);
      }
    }
  }

  const today = startOfDay(new Date());
  const candidateDate = parseISO(candidate.date);
  const daysFromToday = differenceInCalendarDays(candidateDate, today);
  const isWeekendDay = isWeekend(candidateDate);

  // Scoring: više popravljenih > bliži dani > radni dani (jeftiniji)
  const score =
    ordersFixed.length * 10 +
    Math.max(0, 10 - daysFromToday) -
    (isWeekendDay ? 1 : 0);

  return { ordersFixed, score };
}

/**
 * Glavni algoritam: greedy kaskadna simulacija.
 * Iterativno dodaje najboljeg kandidata dok se ne poprave svi kasni nalozi
 * ili dok nema više korisnih kandidata.
 */
export function generateOvertimeSuggestions(
  scheduled: ScheduledOrder[],
  orders: WorkOrder[],
  machines: Machine[],
  overrides: MachineOverride[],
  ganttStartDate: Date,
  sirovineEnabled: boolean
): OvertimeSuggestionResult {
  const { lateIds, byMachine } = countLateOrders(scheduled);

  const totalLate = scheduled.filter((s) => s.stanje === "KASNI").length;
  const totalCritical = scheduled.filter((s) => s.stanje === "KRITIČNO").length;

  if (lateIds.size === 0) {
    return {
      suggestions: [],
      total_late: totalLate,
      total_critical: totalCritical,
      fixable_count: 0,
      total_overtime_hours: 0,
    };
  }

  // Pronađi najdalji rok za svaki problematični stroj
  const today = startOfDay(new Date());
  const maxDeadlineByMachine = new Map<string, Date>();

  for (const s of scheduled) {
    if (!lateIds.has(s.order.id)) continue;
    const deadline = s.order.rok_isporuke
      ? parseISO(s.order.rok_isporuke)
      : addDays(today, 30); // fallback: 30 dana

    const current = maxDeadlineByMachine.get(s.order.machine_id);
    if (!current || deadline > current) {
      maxDeadlineByMachine.set(s.order.machine_id, deadline);
    }
  }

  // Generiraj kandidate za sve problematične strojeve
  let allCandidates: Candidate[] = [];
  for (const [machineId, _orderIds] of byMachine) {
    const machine = machines.find((m) => m.id === machineId);
    if (!machine) continue;

    const maxDeadline = maxDeadlineByMachine.get(machineId) || addDays(today, 30);
    // Generiraj kandidate do roka + 7 dana buffer
    const candidates = generateCandidates(
      machineId,
      machine.name,
      today,
      addDays(maxDeadline, 7),
      overrides
    );
    allCandidates = allCandidates.concat(candidates);
  }

  // Greedy loop: iterativno dodaj najboljeg kandidata
  const suggestions: OvertimeSuggestion[] = [];
  let currentOverrides = [...overrides];
  let currentLateIds = new Set(lateIds);
  const maxIterations = 10; // Ograniči na 10 prijedloga

  for (let iter = 0; iter < maxIterations && currentLateIds.size > 0; iter++) {
    let bestCandidate: Candidate | null = null;
    let bestResult: { ordersFixed: string[]; score: number } | null = null;

    for (const candidate of allCandidates) {
      // Preskoči već dodane datume za isti stroj
      const alreadyAdded = currentOverrides.some(
        (o) => o.machine_id === candidate.machine_id && o.date === candidate.date
      );
      if (alreadyAdded) continue;

      // Preskoči strojeve koji više nemaju kasnih naloga
      const machineStillLate = [...currentLateIds].some((id) => {
        const order = orders.find((o) => o.id === id);
        return order?.machine_id === candidate.machine_id;
      });
      if (!machineStillLate) continue;

      const evaluation = evaluateCandidate(
        candidate,
        orders,
        machines,
        ganttStartDate,
        currentOverrides,
        sirovineEnabled,
        currentLateIds
      );

      if (evaluation.ordersFixed.length === 0) continue;

      if (!bestResult || evaluation.score > bestResult.score) {
        bestCandidate = candidate;
        bestResult = evaluation;
      }
    }

    if (!bestCandidate || !bestResult || bestResult.ordersFixed.length === 0) {
      break; // Nema više korisnih kandidata
    }

    // Dodaj najboljeg
    const suggestion: OvertimeSuggestion = {
      ...bestCandidate,
      orders_fixed: bestResult.ordersFixed,
      score: bestResult.score,
      extra_hours: bestCandidate.hours_gained,
      affected_orders: bestResult.ordersFixed.length,
    };
    suggestions.push(suggestion);

    // Ažuriraj stanje za sljedeću iteraciju
    const tempOverride: MachineOverride = {
      id: `suggestion-${iter}`,
      user_id: "temp",
      machine_id: bestCandidate.machine_id,
      date: bestCandidate.date,
      work_start: bestCandidate.work_start,
      work_end: bestCandidate.work_end,
      created_at: "",
    };
    currentOverrides = [...currentOverrides, tempOverride];

    // Recompute da vidimo tko je još kasni
    const newResult = computeSchedule(
      orders,
      machines,
      ganttStartDate,
      currentOverrides,
      sirovineEnabled
    );
    currentLateIds = new Set<string>();
    for (const s of newResult.scheduled) {
      if (s.stanje === "KASNI" || s.stanje === "KRITIČNO") {
        currentLateIds.add(s.order.id);
      }
    }
  }

  const fixedOrderIds = new Set(suggestions.flatMap((s) => s.orders_fixed));

  return {
    suggestions,
    total_late: totalLate,
    total_critical: totalCritical,
    fixable_count: fixedOrderIds.size,
    total_overtime_hours: suggestions.reduce((sum, s) => sum + s.hours_gained, 0),
  };
}
