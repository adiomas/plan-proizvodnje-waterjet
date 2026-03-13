"use client";

import { useMemo } from "react";
import type {
  ScheduledOrder,
  WorkOrder,
  Machine,
  MachineOverride,
  OvertimeSuggestion,
  OvertimeResult,
} from "@/lib/types";
import {
  WORKDAY_START,
  WORKDAY_END,
  getWorkingHours,
  isWeekend,
} from "@/lib/utils";
import { addDays, startOfDay, format } from "date-fns";

/**
 * Hook koji analizira raspoređene naloge i predlaže prekovremeni rad
 * za dane/strojeve gdje nalozi kasne ili se prelijevaju izvan radnog vremena.
 */
export function useOvertimeSuggestions(
  scheduled: ScheduledOrder[],
  _orders: WorkOrder[],
  machines: Machine[],
  overrides: MachineOverride[],
  ganttStartDate: Date,
  _sirovineEnabled: boolean
): OvertimeResult {
  return useMemo(() => {
    if (scheduled.length === 0 || machines.length === 0) {
      return { fixable_count: 0, suggestions: [] };
    }

    const machineMap = new Map(machines.map((m) => [m.id, m]));
    const suggestions: OvertimeSuggestion[] = [];
    const seen = new Set<string>(); // machine_id + date dedup

    // Analiziraj naloge koji kasne ili imaju status KASNI/KRITIČNO
    const lateOrders = scheduled.filter(
      (s) =>
        s.start &&
        s.end &&
        s.order.machine_id &&
        (s.stanje === "KASNI" || s.stanje === "KRITIČNO")
    );

    // Za svaki kasni nalog, pogledaj dane na kojima radi i predloži prekovremeni
    for (const item of lateOrders) {
      if (!item.start || !item.end) continue;
      const machineId = item.order.machine_id;
      const machine = machineMap.get(machineId);
      if (!machine) continue;

      // Prođi sve dane od starta do enda naloga
      let day = startOfDay(item.start);
      const endDay = startOfDay(item.end);

      while (day <= endDay) {
        if (!isWeekend(day)) {
          const dateStr = format(day, "yyyy-MM-dd");
          const key = `${machineId}:${dateStr}`;

          if (!seen.has(key)) {
            seen.add(key);
            const wh = getWorkingHours(machineId, day, overrides);

            // Predloži samo ako već nema overridea koji produžuje dan
            if (wh && wh.start === WORKDAY_START && wh.end === WORKDAY_END) {
              const extraEnd = "19:00";
              const extraHours = 4;

              // Broj naloga koji padaju na ovaj stroj/dan
              const affectedCount = scheduled.filter((s) => {
                if (!s.start || !s.end || s.order.machine_id !== machineId)
                  return false;
                const sDay = startOfDay(s.start);
                const eDay = startOfDay(s.end);
                return day >= sDay && day <= eDay;
              }).length;

              suggestions.push({
                machine_id: machineId,
                machine_name: machine.name,
                date: dateStr,
                work_start: "07:00",
                work_end: extraEnd,
                extra_hours: extraHours,
                affected_orders: affectedCount,
              });
            }
          }
        }
        day = addDays(day, 1);
      }
    }

    // Sortiraj po datumu
    suggestions.sort((a, b) => a.date.localeCompare(b.date));

    return {
      fixable_count: suggestions.length,
      suggestions,
    };
  }, [scheduled, machines, overrides, ganttStartDate]);
}
