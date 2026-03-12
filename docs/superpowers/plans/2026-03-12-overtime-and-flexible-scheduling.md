# Overtime / Saturday Overrides + Flexible "Ne prije" Scheduling — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-machine per-day working hour overrides (overtime/Saturday) and change `najraniji_pocetak` from fixed pin to flexible "not before" constraint.

**Architecture:** New `machine_day_overrides` table in Supabase stores custom working hours. Scheduler functions become override-aware via `getWorkingHours()` lookup. `najraniji_pocetak` orders move from manual pool to auto pool with minimum date constraint. New modal UI manages overrides; timeline visualizes them with wider day columns and markers.

**Tech Stack:** Next.js 16, React 19, Supabase (PostgreSQL), TypeScript, Tailwind CSS, date-fns

**Spec:** `docs/superpowers/specs/2026-03-12-overtime-and-flexible-scheduling-design.md`

---

## Chunk 1: Data Layer + Scheduler Core

### Task 1: Add MachineOverride type and DB migration

**Dependencies:** None (first task)

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add MachineOverride and WorkingHours types to types.ts**

Add at the end of `src/lib/types.ts`:

```typescript
export interface MachineOverride {
  id: string;
  user_id: string;
  machine_id: string;
  date: string;       // ISO date "2026-03-21"
  work_start: string; // "07:00"
  work_end: string;   // "19:00"
  created_at: string;
}

/** Radno vrijeme za određeni stroj na određeni dan. null = neradni dan. */
export interface WorkingHours {
  start: number; // 7
  end: number;   // 19
  hours: number; // 12
}
```

- [ ] **Step 2: Apply DB migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with this SQL:

```sql
CREATE TABLE machine_day_overrides (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) NOT NULL,
  machine_id  UUID REFERENCES excel_machines(id) ON DELETE CASCADE NOT NULL,
  date        DATE NOT NULL,
  work_start  TIME NOT NULL DEFAULT '07:00',
  work_end    TIME NOT NULL DEFAULT '15:00',
  created_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, machine_id, date)
);

ALTER TABLE machine_day_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own overrides"
  ON machine_day_overrides
  FOR ALL
  USING (auth.uid() = user_id);
```

Note: This project uses Supabase hosted DB — migrations are applied directly via MCP tool, not local files.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add MachineOverride type for machine day overrides"
```

---

### Task 2: Create useOverrides hook

**Dependencies:** Task 1 (types)

**Files:**
- Create: `src/hooks/use-overrides.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/use-overrides.ts`:

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MachineOverride } from "@/lib/types";

export function useOverrides() {
  const [overrides, setOverrides] = useState<MachineOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchOverrides = useCallback(async () => {
    const { data, error } = await supabase
      .from("machine_day_overrides")
      .select("*")
      .order("date");

    if (error) {
      console.error("Greška pri dohvaćanju overridea:", error);
      return;
    }
    setOverrides(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  const addOverride = async (
    machineId: string,
    date: string,
    workStart: string,
    workEnd: string
  ) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;

    const { data, error } = await supabase
      .from("machine_day_overrides")
      .insert({
        user_id: userData.user.id,
        machine_id: machineId,
        date,
        work_start: workStart,
        work_end: workEnd,
      })
      .select()
      .single();

    if (error) {
      console.error("Greška pri dodavanju overridea:", error);
      return null;
    }
    setOverrides((prev) => [...prev, data]);
    return data;
  };

  const deleteOverride = async (id: string) => {
    const { error } = await supabase
      .from("machine_day_overrides")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Greška pri brisanju overridea:", error);
      return;
    }
    setOverrides((prev) => prev.filter((o) => o.id !== id));
  };

  return { overrides, loading, addOverride, deleteOverride, refetch: fetchOverrides };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-overrides.ts
git commit -m "feat: add useOverrides hook for machine day overrides CRUD"
```

---

### Task 3: Add getWorkingHours and update utils.ts

**Dependencies:** Task 1 (types)

**Files:**
- Modify: `src/lib/utils.ts`

- [ ] **Step 1: Add getWorkingHours function and update imports**

Add to `src/lib/utils.ts`, after the existing constants and before `setTime`:

```typescript
import type { MachineOverride, WorkingHours } from "./types";
```

Add at the end of `src/lib/utils.ts`:

```typescript
/** Parsiraj "HH:MM" string u broj sati (npr. "07:00" → 7, "13:30" → 13.5) */
export function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h + (m || 0) / 60;
}

/**
 * Dohvati radno vrijeme za određeni stroj na određeni dan.
 * Vraća null ako je neradni dan (vikend bez overridea).
 */
export function getWorkingHours(
  machineId: string,
  date: Date,
  overrides: MachineOverride[]
): WorkingHours | null {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const override = overrides.find(
    (o) => o.machine_id === machineId && o.date === dateStr
  );

  if (override) {
    const start = parseTime(override.work_start);
    const end = parseTime(override.work_end);
    return { start, end, hours: end - start };
  }

  // Vikend bez overridea = neradni dan
  if (isWeekend(date)) return null;

  // Default radno vrijeme
  return { start: WORKDAY_START, end: WORKDAY_END, hours: HOURS_PER_DAY };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils.ts
git commit -m "feat: add getWorkingHours utility with override support"
```

---

### Task 4: Update scheduler — override-aware time functions

**Dependencies:** Task 1 (types), Task 3 (getWorkingHours)

**Files:**
- Modify: `src/lib/scheduler.ts`

This is the largest task. We modify all time functions to accept machineId + overrides, and change `najraniji_pocetak` behavior.

- [ ] **Step 1: Update imports in scheduler.ts**

Replace the imports at top of `src/lib/scheduler.ts`:

```typescript
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
```

- [ ] **Step 2: Update computeSchedule signature and "ne prije" logic**

Replace the `computeSchedule` function. Key changes:
- Add `overrides: MachineOverride[]` parameter
- Move `najraniji_pocetak` orders (without `zeljeni_redoslijed`) to auto pool
- Pass overrides through to all sub-functions

```typescript
export function computeSchedule(
  orders: WorkOrder[],
  machines: Machine[],
  ganttStartDate: Date,
  overrides: MachineOverride[] = []
): ScheduleResult {
  const sorted = [...orders].sort((a, b) => a.sort_order - b.sort_order);

  const manualOrders: WorkOrder[] = [];
  const autoOrders: WorkOrder[] = [];

  for (const order of sorted) {
    const hasRedoslijed = order.zeljeni_redoslijed !== null;
    const hasPocetak = order.najraniji_pocetak !== null;
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

  const scheduled: ScheduledOrder[] = [];
  for (const order of manualOrders) {
    const result = scheduleManualOrder(order, scheduled, ganttStartDate, overrides);
    scheduled.push(result);
  }

  scheduleAutoOrders(autoOrders, scheduled, machines, ganttStartDate, overrides);

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
```

- [ ] **Step 3: Update toWorkTime to be override-aware**

Replace the `toWorkTime` function:

```typescript
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
```

- [ ] **Step 4: Update adjustStartForEOD to be override-aware**

Replace the `adjustStartForEOD` function:

```typescript
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

  if (durationH <= wh.hours) {
    // Nalog stane u jedan dan, ali ne danas — sljedeći radni dan
    let next = addDays(startOfDay(start), 1);
    for (let i = 0; i < 10; i++) {
      const nextWh = getWorkingHours(machineId, next, overrides);
      if (nextWh !== null) {
        return setTime(next, nextWh.start);
      }
      next = addDays(next, 1);
    }
    return workdayStart(nextWorkday(start));
  }

  return start;
}
```

- [ ] **Step 5: Update calculateEnd to be override-aware (day-by-day loop)**

Replace the `calculateEnd` function:

```typescript
function calculateEnd(
  start: Date,
  hours: number,
  machineId: string,
  overrides: MachineOverride[]
): Date {
  const wh = getWorkingHours(machineId, start, overrides);
  if (!wh) return start; // fallback

  const startHour = start.getHours() + start.getMinutes() / 60;

  // Stane u ovaj radni dan?
  if (startHour + hours <= wh.end) {
    return setTime(start, 0, (startHour + hours) * 60);
  }

  // Multi-day: oduzimaj dane dok ne potrošiš sve sate
  let remaining = hours - (wh.end - startHour);
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
```

- [ ] **Step 6: Update findEarliestStart to pass machineId + overrides**

Replace the `findEarliestStart` function:

```typescript
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
```

- [ ] **Step 7: Update scheduleAutoOrders — "ne prije" + overrides**

Replace the `scheduleAutoOrders` function:

```typescript
function scheduleAutoOrders(
  autoOrders: WorkOrder[],
  scheduled: ScheduledOrder[],
  machines: Machine[],
  ganttStartDate: Date,
  overrides: MachineOverride[]
): void {
  // EDD: sortiraj po roku (najhitniji prvo), null rok ide na kraj
  const sorted = [...autoOrders].sort((a, b) => {
    const aDeadline = a.rok_isporuke ? parseISO(a.rok_isporuke).getTime() : Infinity;
    const bDeadline = b.rok_isporuke ? parseISO(b.rok_isporuke).getTime() : Infinity;
    if (aDeadline !== bDeadline) return aDeadline - bDeadline;
    return a.sort_order - b.sort_order;
  });

  const occupiedByMachine = new Map<string, TimeRange[]>();

  for (const m of machines) {
    // Izračunaj gantt start za svaki stroj (override-aware)
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

  for (const order of sorted) {
    if (!order.machine_id || order.trajanje_h <= 0) {
      scheduled.push(makeResult(order, null, null, "NEMA RASPOREDA"));
      continue;
    }

    const occupied = occupiedByMachine.get(order.machine_id) ?? [];

    // "Ne prije" logika: ako nalog ima najraniji_pocetak, koristi ga kao minimum
    let earliest = ganttStartDate;
    if (order.najraniji_pocetak) {
      const npDate = parseISO(order.najraniji_pocetak);
      if (isAfter(npDate, ganttStartDate)) {
        earliest = npDate;
      }
    }

    const start = findEarliestStart(
      earliest,
      order.trajanje_h,
      occupied,
      order.machine_id,
      overrides
    );
    const end = calculateEnd(start, order.trajanje_h, order.machine_id, overrides);
    const stanje = calculateDeadline(order, end);

    scheduled.push(makeResult(order, start, end, "OK", stanje));
    occupied.push({ start, end });
  }
}
```

- [ ] **Step 8: Update scheduleManualOrder — overrides + remove najraniji_pocetak handling**

Replace the `scheduleManualOrder` function. Key change: this only handles `zeljeni_redoslijed` now (since `najraniji_pocetak`-only orders moved to auto pool):

```typescript
function scheduleManualOrder(
  order: WorkOrder,
  previouslyScheduled: ScheduledOrder[],
  ganttStartDate: Date,
  overrides: MachineOverride[]
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

  return makeResult(order, start, end, "OK", stanje);
}
```

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/lib/scheduler.ts
git commit -m "feat: override-aware scheduler with 'ne prije' flexible semantics"
```

---

## Chunk 2: UI Components

### Task 5: Create Override Modal component

**Dependencies:** Task 1 (types)

**Files:**
- Create: `src/components/override-modal.tsx`

- [ ] **Step 1: Create the modal component**

Create `src/components/override-modal.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Machine, MachineOverride } from "@/lib/types";
import { getDay } from "date-fns";

interface OverrideModalProps {
  open: boolean;
  onClose: () => void;
  machines: Machine[];
  overrides: MachineOverride[];
  onAdd: (machineId: string, date: string, workStart: string, workEnd: string) => Promise<MachineOverride | null>;
  onDelete: (id: string) => Promise<void>;
}

export function OverrideModal({
  open,
  onClose,
  machines,
  overrides,
  onAdd,
  onDelete,
}: OverrideModalProps) {
  const [machineId, setMachineId] = useState("");
  const [date, setDate] = useState("");
  const [workStart, setWorkStart] = useState("07:00");
  const [workEnd, setWorkEnd] = useState("15:00");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  if (!open) return null;

  const resetForm = () => {
    setMachineId("");
    setDate("");
    setWorkStart("07:00");
    setWorkEnd("15:00");
    setError("");
  };

  const handleAdd = async () => {
    setError("");

    if (!machineId) { setError("Odaberi stroj"); return; }
    if (!date) { setError("Odaberi datum"); return; }
    if (workEnd <= workStart) { setError("Kraj mora biti nakon početka"); return; }

    const exists = overrides.find(
      (o) => o.machine_id === machineId && o.date === date
    );
    if (exists) { setError("Override za taj stroj i dan već postoji"); return; }

    setAdding(true);
    const result = await onAdd(machineId, date, workStart, workEnd);
    setAdding(false);

    if (result) resetForm();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const days = ["ned", "pon", "uto", "sri", "čet", "pet", "sub"];
    const dayName = days[getDay(d)];
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dayName} ${dd}.${mm}.${yyyy}`;
  };

  const getTypeBadge = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const day = getDay(d);
    if (day === 0 || day === 6) {
      return (
        <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full border border-purple-200">
          Radna subota
        </span>
      );
    }
    return (
      <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">
        Prekovremeni
      </span>
    );
  };

  const getMachineName = (id: string) => machines.find((m) => m.id === id)?.name ?? "—";
  const getMachineColor = (id: string) => machines.find((m) => m.id === id)?.color ?? "#999";

  const calcHours = (start: string, end: string) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  };

  // Sortiraj po datumu
  const sortedOverrides = [...overrides].sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  const isPast = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dateStr + "T00:00:00") < today;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Posebno radno vrijeme</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Add form */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[120px]">
              <label className="text-[10px] text-gray-500 block mb-0.5">Stroj</label>
              <select
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white"
              >
                <option value="">Odaberi...</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[130px]">
              <label className="text-[10px] text-gray-500 block mb-0.5">Datum</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white"
              />
            </div>
            <div className="min-w-[70px]">
              <label className="text-[10px] text-gray-500 block mb-0.5">Od</label>
              <input
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white"
              />
            </div>
            <div className="min-w-[70px]">
              <label className="text-[10px] text-gray-500 block mb-0.5">Do</label>
              <input
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={adding}
              className="text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {adding ? "..." : "Dodaj"}
            </button>
          </div>
          {error && (
            <p className="text-[10px] text-red-500 mt-1">{error}</p>
          )}
        </div>

        {/* Override list */}
        <div className="flex-1 overflow-auto px-4 py-2">
          {sortedOverrides.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">
              Nema posebnog radnog vremena
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="py-1.5 font-medium">Stroj</th>
                  <th className="py-1.5 font-medium">Datum</th>
                  <th className="py-1.5 font-medium">Od</th>
                  <th className="py-1.5 font-medium">Do</th>
                  <th className="py-1.5 font-medium">Sati</th>
                  <th className="py-1.5 font-medium">Tip</th>
                  <th className="py-1.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sortedOverrides.map((o) => (
                  <tr
                    key={o.id}
                    className={`border-t border-gray-100 ${isPast(o.date) ? "opacity-40" : ""}`}
                  >
                    <td className="py-1.5">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1"
                        style={{ backgroundColor: getMachineColor(o.machine_id) }}
                      />
                      {getMachineName(o.machine_id)}
                    </td>
                    <td className="py-1.5">{formatDate(o.date)}</td>
                    <td className="py-1.5">{o.work_start}</td>
                    <td className="py-1.5 font-medium">{o.work_end}</td>
                    <td className="py-1.5">{calcHours(o.work_start, o.work_end)}h</td>
                    <td className="py-1.5">{getTypeBadge(o.date)}</td>
                    <td className="py-1.5">
                      <button
                        onClick={() => onDelete(o.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                        title="Obriši"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/override-modal.tsx
git commit -m "feat: add OverrideModal component for managing working hour overrides"
```

---

### Task 6: Update Dashboard — wire overrides

**Dependencies:** Tasks 1-5 (all prior tasks)

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add imports and hook**

At top of `dashboard/page.tsx`, add import:

```typescript
import { useOverrides } from "@/hooks/use-overrides";
import { OverrideModal } from "@/components/override-modal";
```

Inside `DashboardPage`, after `useWorkOrders()`:

```typescript
const {
  overrides,
  loading: overridesLoading,
  addOverride,
  deleteOverride,
} = useOverrides();
```

Add state:

```typescript
const [showOverrides, setShowOverrides] = useState(false);
```

- [ ] **Step 2: Update loading check**

Change loading condition to include overrides:

```typescript
if (machinesLoading || ordersLoading || overridesLoading) {
```

- [ ] **Step 3: Update computeSchedule call**

Change the `scheduleResult` useMemo:

```typescript
const scheduleResult = useMemo(() => {
  if (machines.length === 0)
    return { scheduled: [], byMachine: new Map<string, never[]>() };
  return computeSchedule(orders, machines, ganttStartDate, overrides);
}, [orders, machines, ganttStartDate, overrides]);
```

- [ ] **Step 4: Add "Radno vrijeme" button to header**

In the header, before the Export PDF button, add:

```tsx
{/* Override modal button */}
<button
  onClick={() => setShowOverrides(true)}
  className="hidden lg:inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
  title="Posebno radno vrijeme"
>
  <span>⏰</span>
  {overrides.length > 0 && (
    <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1 rounded-full">{overrides.length}</span>
  )}
</button>
```

- [ ] **Step 5: Pass overrides to Timeline**

Update both Timeline usages (desktop and mobile) to include `overrides` prop:

```tsx
<Timeline
  machines={machines}
  scheduled={scheduleResult.scheduled}
  ganttStartDate={ganttStartDate}
  hoveredOrderId={hoveredOrderId}
  onHoverOrder={setHoveredOrderId}
  onMoveOrder={handleMoveOrder}
  onUnpinOrder={handleUnpinOrder}
  overrides={overrides}
/>
```

- [ ] **Step 6: Add OverrideModal before closing tag**

Before `</div>` at the end, add:

```tsx
{/* ======== Override Modal ======== */}
<OverrideModal
  open={showOverrides}
  onClose={() => setShowOverrides(false)}
  machines={machines}
  overrides={overrides}
  onAdd={addOverride}
  onDelete={deleteOverride}
/>
```

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: wire overrides into dashboard — hook, modal, scheduler, timeline"
```

---

### Task 7: Update Timeline — override visualization + "ne prije" indicator

**Dependencies:** Tasks 1, 3 (types + getWorkingHours)

**Files:**
- Modify: `src/components/timeline.tsx`

This is the most complex UI task. Changes:
1. Accept `overrides` prop
2. Wider day columns for override days (day zoom)
3. ⚡ markers on override days (week/month zoom)
4. ⏳ instead of 📌 for "ne prije" orders
5. Unpin popover with confirmation
6. Override-aware drag snap (allow Saturday with override)

- [ ] **Step 1: Add overrides prop and imports**

Add `overrides` to `TimelineProps`:

```typescript
import type { Machine, MachineOverride, ScheduledOrder } from "@/lib/types";
import { getWorkingHours } from "@/lib/utils";

interface TimelineProps {
  machines: Machine[];
  scheduled: ScheduledOrder[];
  ganttStartDate: Date;
  hoveredOrderId?: string | null;
  onHoverOrder?: (id: string | null) => void;
  onMoveOrder?: (orderId: string, targetDate: string) => void;
  onUnpinOrder?: (orderId: string) => void;
  overrides?: MachineOverride[];
}
```

Add `overrides = []` to destructuring:

```typescript
export function Timeline({
  machines,
  scheduled,
  ganttStartDate,
  hoveredOrderId,
  onHoverOrder,
  onMoveOrder,
  onUnpinOrder,
  overrides = [],
}: TimelineProps) {
```

- [ ] **Step 2: Add unpin popover state**

After `dragDeltaPx` state, add:

```typescript
const [unpinConfirm, setUnpinConfirm] = useState<{ orderId: string; x: number; y: number } | null>(null);
```

- [ ] **Step 3: Calculate per-day widths for day zoom (override-aware)**

After `const hourWidth = ...` line, add override-aware width calculation:

```typescript
// Per-dan širina za day zoom (override dana mogu biti širi)
const getDayMaxHours = useCallback((dayIdx: number): number => {
  const day = addDays(ganttStartDate, dayIdx);
  let maxH = WORK_HOURS;
  for (const m of machines) {
    const wh = getWorkingHours(m.id, day, overrides);
    if (wh && wh.hours > maxH) maxH = wh.hours;
  }
  return maxH;
}, [ganttStartDate, machines, overrides]);

// Kumulativne pozicije dana za day zoom
const dayPositions = useMemo(() => {
  if (zoom !== "day") return null;
  const positions: { left: number; width: number; hours: number }[] = [];
  let x = 0;
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const maxH = getDayMaxHours(i);
    const w = maxH * 30; // 30px po satu
    positions.push({ left: x, width: w, hours: maxH });
    x += w;
  }
  return positions;
}, [zoom, getDayMaxHours]);

const dynamicTotalWidth = zoom === "day" && dayPositions
  ? dayPositions[dayPositions.length - 1].left + dayPositions[dayPositions.length - 1].width
  : totalWidth;
```

- [ ] **Step 4: Check if day has any override for any machine**

```typescript
const dayHasOverride = useCallback((dayIdx: number): boolean => {
  const day = addDays(ganttStartDate, dayIdx);
  return machines.some((m) => {
    const wh = getWorkingHours(m.id, day, overrides);
    return wh !== null && wh.hours > WORK_HOURS;
  });
}, [ganttStartDate, machines, overrides]);
```

- [ ] **Step 5: Update getBarSegments to use dynamic day positions**

Update `getBarSegments` to use `dayPositions` when in day zoom, and use per-machine override hours:

```typescript
const getBarSegments = (s: ScheduledOrder): BarSegment[] => {
  if (!s.start || !s.end) return [];
  const segments: BarSegment[] = [];
  const startDayIdx = differenceInCalendarDays(startOfDay(s.start), ganttStartDate);
  const endDayIdx = differenceInCalendarDays(startOfDay(s.end), ganttStartDate);

  for (let dayIdx = startDayIdx; dayIdx <= endDayIdx; dayIdx++) {
    if (dayIdx < 0 || dayIdx >= TOTAL_DAYS) continue;
    const day = addDays(ganttStartDate, dayIdx);

    // Dohvati radno vrijeme za ovaj stroj ovaj dan
    const wh = getWorkingHours(s.order.machine_id, day, overrides);
    if (!wh) continue; // neradni dan

    let startH = wh.start;
    if (dayIdx === startDayIdx) {
      const h = s.start.getHours() + s.start.getMinutes() / 60;
      startH = Math.max(wh.start, Math.min(wh.end, h));
    }

    let endH = wh.end;
    if (dayIdx === endDayIdx) {
      const h = s.end.getHours() + s.end.getMinutes() / 60;
      endH = Math.max(wh.start, Math.min(wh.end, h));
    }

    if (endH <= startH) continue;

    if (zoom === "day" && dayPositions) {
      const dp = dayPositions[dayIdx];
      const pxPerHour = dp.width / dp.hours;
      const startFrac = startH - wh.start;
      const endFrac = endH - wh.start;
      segments.push({
        left: dp.left + startFrac * pxPerHour,
        width: Math.max((endFrac - startFrac) * pxPerHour, 2),
      });
    } else {
      const startFrac = (startH - WORKDAY_START) / WORK_HOURS;
      const endFrac = (endH - WORKDAY_START) / WORK_HOURS;
      segments.push({
        left: dayIdx * dayWidth + startFrac * dayWidth,
        width: Math.max((endFrac - startFrac) * dayWidth, 2),
      });
    }
  }
  return segments;
};
```

- [ ] **Step 6: Update nowOffset calculation for dynamic widths**

Replace the `nowOffset` calculation to use `dayPositions`:

```typescript
let nowOffset: number | null = null;
if (todayDayIdx >= 0 && todayDayIdx < TOTAL_DAYS) {
  const hour = now.getHours() + now.getMinutes() / 60;
  const clamped = Math.max(WORKDAY_START, Math.min(WORKDAY_END, hour));

  if (zoom === "day" && dayPositions) {
    const dp = dayPositions[todayDayIdx];
    const frac = (clamped - WORKDAY_START) / dp.hours;
    nowOffset = dp.left + frac * dp.width;
  } else {
    const frac = (clamped - WORKDAY_START) / WORK_HOURS;
    nowOffset = todayDayIdx * dayWidth + frac * dayWidth;
  }
}
```

- [ ] **Step 7: Update snap drag logic for override-aware snapping**

Update `snapDeltaToDays` to allow Saturday drops when override exists:

```typescript
const snapDeltaToDays = useCallback(
  (deltaPx: number, originalDayIdx: number): number => {
    const effectiveDayWidth = zoom === "day" && dayPositions
      ? dayPositions[originalDayIdx]?.width ?? dayWidth
      : dayWidth;
    const rawDays = Math.round(deltaPx / effectiveDayWidth);
    if (rawDays === 0) return 0;

    let targetIdx = originalDayIdx;
    let remaining = Math.abs(rawDays);
    const direction = rawDays > 0 ? 1 : -1;

    while (remaining > 0) {
      targetIdx += direction;
      if (targetIdx < 0 || targetIdx >= TOTAL_DAYS) break;
      const d = addDays(ganttStartDate, targetIdx);
      // Dozvoli dan ako nije vikend ILI ako ima override za bilo koji stroj
      if (!isWeekend(d) || dayHasOverride(targetIdx)) {
        remaining--;
      }
    }

    // Provjeri da target dan nije neradni vikend
    while (
      targetIdx >= 0 && targetIdx < TOTAL_DAYS &&
      isWeekend(addDays(ganttStartDate, targetIdx)) &&
      !dayHasOverride(targetIdx)
    ) {
      targetIdx += direction;
    }

    return targetIdx - originalDayIdx;
  },
  [dayWidth, dayPositions, zoom, ganttStartDate, dayHasOverride]
);
```

Also update `getDragTargetDate` to allow override weekends:

```typescript
const getDragTargetDate = useCallback((): string | null => {
  if (!dragState || !dragState.isDragging) return null;
  const snappedDelta = snapDeltaToDays(dragDeltaPx, dragState.originalDayIdx);
  const targetDayIdx = dragState.originalDayIdx + snappedDelta;
  if (targetDayIdx < 0 || targetDayIdx >= TOTAL_DAYS) return null;
  const targetDate = addDays(ganttStartDate, targetDayIdx);
  // Dozvoli ako nije vikend ili ima override
  if (isWeekend(targetDate) && !dayHasOverride(targetDayIdx)) return null;
  return format(targetDate, "yyyy-MM-dd");
}, [dragState, dragDeltaPx, snapDeltaToDays, ganttStartDate, dayHasOverride]);
```

- [ ] **Step 8: Replace 📌 with ⏳ and add unpin popover**

In the bar rendering section, replace the pin icon logic:

```tsx
{isPinned && onUnpinOrder && (
  <button
    className="inline-flex items-center hover:bg-white/30 rounded px-0.5 -ml-0.5"
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => {
      e.stopPropagation();
      setUnpinConfirm({
        orderId: s.order.id,
        x: e.clientX,
        y: e.clientY,
      });
    }}
    title="Ukloni 'ne prije' datum"
  >
    ⏳
  </button>
)}
{isPinned && !onUnpinOrder && "⏳ "}
```

Also update tooltip emoji:

```tsx
{tooltip.order.order.najraniji_pocetak !== null && "⏳ "}
```

And update tooltip hint text:

```tsx
{tooltip.order.order.najraniji_pocetak !== null && (
  <div className="text-blue-300 text-[9px] mt-0.5">
    Ne prije {tooltip.order.order.najraniji_pocetak} • klikni ⏳ za uklanjanje
  </div>
)}
```

- [ ] **Step 9: Add unpin confirmation popover**

After the tooltip div, add:

```tsx
{/* Unpin confirmation popover */}
{unpinConfirm && (
  <div
    className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-xs"
    style={{ left: unpinConfirm.x - 80, top: unpinConfirm.y - 90 }}
  >
    <p className="font-medium text-gray-900 mb-1">Ukloniti &quot;ne prije&quot; datum?</p>
    <p className="text-gray-500 mb-2">Nalog će se rasporediti automatski po roku.</p>
    <div className="flex gap-2 justify-end">
      <button
        className="px-2.5 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
        onClick={() => setUnpinConfirm(null)}
      >
        Odustani
      </button>
      <button
        className="px-2.5 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
        onClick={() => {
          onUnpinOrder?.(unpinConfirm.orderId);
          setUnpinConfirm(null);
        }}
      >
        Ukloni
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 10: Add ⚡ marker for week/month zoom override days**

In the machine row rendering, after the weekend šrafure, add override markers for week/month zoom:

```tsx
{/* Override markers (tjedan/mjesec zoom) */}
{zoom !== "day" && days.map((day, i) => {
  const wh = getWorkingHours(machine.id, day, overrides);
  if (!wh || wh.hours <= WORK_HOURS) return null;
  return (
    <div
      key={`ov-${i}`}
      className="absolute bottom-0.5 text-[7px] text-yellow-600 pointer-events-none"
      style={{ left: i * dayWidth + 2, width: dayWidth - 4, textAlign: "center" }}
      title={`${wh.start}:00-${wh.end}:00 (${wh.hours}h)`}
    >
      ⚡
    </div>
  );
})}
```

- [ ] **Step 11: In day zoom, render override day headers with ⚡ and use dynamic widths**

Update the day zoom header rendering to use `dayPositions` and show ⚡:

```tsx
{zoom === "day" && dayPositions ? (
  <div style={{ marginLeft: 100 }}>
    <div className="flex">
      {days.map((day, i) => {
        const weekend = getDay(day) === 0 || getDay(day) === 6;
        const dp = dayPositions[i];
        const hasOv = dayHasOverride(i);
        return (
          <div
            key={i}
            className={`flex-shrink-0 text-center text-[10px] border-r border-gray-200 py-0.5 font-medium ${
              weekend && !hasOv ? "bg-gray-100 text-gray-400" :
              hasOv ? "bg-yellow-50 text-yellow-700" : "text-gray-600"
            }`}
            style={{ width: dp.width }}
          >
            {formatDayDate(day)}{hasOv ? " ⚡" : ""}
          </div>
        );
      })}
    </div>
    {/* Satni header */}
    <div className="flex">
      {days.map((day, dayIdx) => {
        const weekend = getDay(day) === 0 || getDay(day) === 6;
        const dp = dayPositions[dayIdx];
        const maxH = dp.hours;
        const hWidth = dp.width / maxH;
        const hoursForDay: number[] = [];
        // Uzmi najšire radno vrijeme za taj dan
        for (let h = WORKDAY_START; h < WORKDAY_START + maxH; h++) hoursForDay.push(h);
        return (
          <div key={dayIdx} className="flex flex-shrink-0" style={{ width: dp.width }}>
            {hoursForDay.map((h) => (
              <div
                key={h}
                className={`text-center text-[8px] border-r border-gray-100 py-0.5 ${
                  weekend && !dayHasOverride(dayIdx) ? "bg-gray-100 text-gray-300" : "text-gray-400"
                }`}
                style={{ width: hWidth }}
              >
                {String(h).padStart(2, "0")}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  </div>
) : /* existing week/month header unchanged */ (
```

- [ ] **Step 12: Update container width and separator positions for dynamic widths**

Replace `style={{ width: totalWidth + 100 }}` with:

```tsx
style={{ width: dynamicTotalWidth + 100 }}
```

Update day separators and weekend šrafure to use `dayPositions` when in day zoom:

```tsx
{/* Day separators */}
{zoom === "day" && dayPositions
  ? dayPositions.map((dp, i) => (
      <div key={`sep-${i}`} className="absolute top-0 bottom-0 border-r border-gray-100" style={{ left: dp.left }} />
    ))
  : days.map((_, i) => (
      <div key={`sep-${i}`} className="absolute top-0 bottom-0 border-r border-gray-100" style={{ left: i * dayWidth }} />
    ))
}
```

- [ ] **Step 13: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 14: Commit**

```bash
git add src/components/timeline.tsx
git commit -m "feat: override-aware timeline with dynamic widths, markers, and unpin popover"
```

---

### Task 8: Update work-orders-table — ⏳ indicator

**Dependencies:** None (independent UI change)

**Files:**
- Modify: `src/components/work-orders-table.tsx`

- [ ] **Step 1: Replace 📌 with ⏳ in table display**

In `src/components/work-orders-table.tsx`, search for all occurrences of `📌` emoji and replace each with `⏳`. These appear in:
- Column display for "Početak od" — where orders with `najraniji_pocetak` show pin icon
- Any tooltip or status text that references the pin

Use the Edit tool with `replace_all: true` to replace `📌` → `⏳` across the file.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/work-orders-table.tsx
git commit -m "feat: replace pin emoji with hourglass for 'ne prije' orders in table"
```

---

### Task 9: Update PDF export — override-aware hours

**Dependencies:** Task 3 (getWorkingHours)

**Files:**
- Modify: `src/lib/pdf/daily-report.tsx`
- Modify: `src/lib/pdf/weekly-report.tsx`
- Modify: `src/lib/pdf/generate.tsx`

- [ ] **Step 1: Pass overrides to PDF generation**

Update `src/lib/pdf/generate.tsx` to accept `overrides: MachineOverride[]` parameter and pass it through to daily/weekly report components.

- [ ] **Step 2: Update daily report headers**

In `src/lib/pdf/daily-report.tsx`, use `getWorkingHours()` to show correct working hours per machine per day in the report header. If a machine has an override for the report day, show extended hours (e.g., "07:00-19:00" instead of "07:00-15:00").

- [ ] **Step 3: Update weekly report**

In `src/lib/pdf/weekly-report.tsx`, use `getWorkingHours()` for each day column to correctly mark override days (e.g., highlight with a note "⚡ 12h").

- [ ] **Step 4: Update ExportMenu in dashboard to pass overrides**

In `src/app/dashboard/page.tsx`, update the `ExportMenu` component call to include `overrides` prop.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/ src/app/dashboard/page.tsx
git commit -m "feat: override-aware PDF export showing extended working hours"
```

---

### Task 10: Final verification and manual test

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Run dev server and test manually**

Run: `npm run dev`

Test checklist:
1. Open dashboard — verify it loads without errors
2. Open "⏰ Radno vrijeme" modal — verify it opens
3. Add an override: Classica, any Saturday, 07:00 → 13:00
4. Verify override appears in the table with "Radna subota" badge
5. Delete the override — verify it disappears
6. Add an override: Arpel, next Wednesday, 07:00 → 19:00
7. Verify day zoom shows wider column for that Wednesday with ⚡
8. Verify week/month zoom shows ⚡ marker
9. Create a work order with `najraniji_pocetak` set to a future date
10. Verify ⏳ icon appears (not 📌)
11. Click ⏳ — verify confirmation popover appears
12. Click "Ukloni" — verify order moves to auto scheduling
13. Drag an order to a new date — verify ⏳ appears after drop
14. Drag order to Saturday WITHOUT override — verify it doesn't snap
15. Drag order to Saturday WITH override — verify it snaps

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
