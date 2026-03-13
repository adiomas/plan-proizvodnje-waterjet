"use client";

import { useMemo } from "react";
import type {
  WorkOrder,
  Machine,
  MachineOverride,
  ScheduledOrder,
  OvertimeSuggestionResult,
} from "@/lib/types";
import { generateOvertimeSuggestions } from "@/lib/overtime-engine";

export function useOvertimeSuggestions(
  scheduled: ScheduledOrder[],
  orders: WorkOrder[],
  machines: Machine[],
  overrides: MachineOverride[],
  ganttStartDate: Date,
  sirovineEnabled: boolean
): OvertimeSuggestionResult {
  return useMemo(() => {
    if (scheduled.length === 0 || machines.length === 0) {
      return {
        suggestions: [],
        total_late: 0,
        total_critical: 0,
        fixable_count: 0,
        total_overtime_hours: 0,
      };
    }
    return generateOvertimeSuggestions(
      scheduled,
      orders,
      machines,
      overrides,
      ganttStartDate,
      sirovineEnabled
    );
  }, [scheduled, orders, machines, overrides, ganttStartDate, sirovineEnabled]);
}
