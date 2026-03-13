"use client";

import type { Machine, ScheduledOrder } from "@/lib/types";

interface StatusBarProps {
  scheduled: ScheduledOrder[];
  machines: Machine[];
}

export function StatusBar({ scheduled, machines }: StatusBarProps) {
  const okCount = scheduled.filter((s) => s.status === "OK").length;
  const overlapCount = scheduled.filter(
    (s) => s.status === "PREKLAPANJE"
  ).length;
  const lateCount = scheduled.filter((s) => s.stanje === "KASNI").length;

  const hoursByMachine = new Map<string, number>();
  for (const m of machines) hoursByMachine.set(m.id, 0);
  for (const s of scheduled) {
    if (s.order.machine_id && s.order.trajanje_h) {
      const current = hoursByMachine.get(s.order.machine_id) ?? 0;
      hoursByMachine.set(s.order.machine_id, current + s.order.trajanje_h);
    }
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-1.5 sm:py-2 bg-white border-t text-[10px] sm:text-[11px] flex-shrink-0 overflow-x-auto lg:pb-safe">
      {machines.map((m) => (
        <div key={m.id} className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          <span
            className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full"
            style={{ backgroundColor: m.color }}
          />
          <span className="text-gray-500">{m.name}</span>
          <span className="font-semibold tabular-nums">
            {hoursByMachine.get(m.id) ?? 0}h
          </span>
        </div>
      ))}

      <div className="h-3 w-px bg-gray-200 flex-shrink-0" />

      <span className="text-emerald-600 flex-shrink-0">
        OK <b className="tabular-nums">{okCount}</b>
      </span>
      {overlapCount > 0 && (
        <span className="text-red-600 flex-shrink-0 font-medium">
          Prekl. <b className="tabular-nums">{overlapCount}</b>
        </span>
      )}
      {lateCount > 0 && (
        <span className="text-red-600 flex-shrink-0 font-medium">
          Kasni <b className="tabular-nums">{lateCount}</b>
        </span>
      )}
    </div>
  );
}
