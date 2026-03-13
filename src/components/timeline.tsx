"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { addDays, startOfDay, getDay, format, differenceInCalendarDays } from "date-fns";
import type { Machine, ScheduledOrder, MachineOverride } from "@/lib/types";
import { formatDuration } from "@/components/ui/duration-input";
import {
  formatDayDate,
  formatDayShort,
  formatTime,
  WORKDAY_START,
  WORKDAY_END,
  isWeekend,
  getWorkingHours,
} from "@/lib/utils";

interface TimelineProps {
  machines: Machine[];
  scheduled: ScheduledOrder[];
  ganttStartDate: Date;
  hoveredOrderId?: string | null;
  hoveredSplitGroup?: string | null;
  onHoverOrder?: (id: string | null) => void;
  onClickOrder?: (orderId: string) => void;
  onMoveOrder?: (orderId: string, targetDate: string) => void;
  onUnpinOrder?: (orderId: string) => void;
  overrides?: MachineOverride[];
  sirovineEnabled?: boolean;
}

type ZoomLevel = "day" | "week" | "month";

const TOTAL_DAYS = 183; // ~6 mjeseci

const MONTH_NAMES_HR = [
  "Siječanj", "Veljača", "Ožujak", "Travanj", "Svibanj", "Lipanj",
  "Srpanj", "Kolovoz", "Rujan", "Listopad", "Studeni", "Prosinac",
];

const DAY_NAMES_SHORT = ["ned", "pon", "uto", "sri", "čet", "pet", "sub"];
const WORK_HOURS = WORKDAY_END - WORKDAY_START; // 8 sati
const MIN_DRAG_PX = 5;

interface BarSegment {
  left: number;
  width: number;
}

interface DragState {
  orderId: string;
  startX: number;
  originalDayIdx: number;
  isDragging: boolean; // true nakon MIN_DRAG_PX pomaka
}

export function Timeline({
  machines,
  scheduled,
  ganttStartDate,
  hoveredOrderId,
  hoveredSplitGroup,
  onHoverOrder,
  onClickOrder,
  onMoveOrder,
  onUnpinOrder,
  overrides = [],
  sirovineEnabled = false,
}: TimelineProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("day");
  const [tooltip, setTooltip] = useState<{
    order: ScheduledOrder;
    x: number;
    y: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragOccurredRef = useRef(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragDeltaPx, setDragDeltaPx] = useState(0);
  const [unpinConfirm, setUnpinConfirm] = useState<{ orderId: string; x: number; y: number } | null>(null);

  const dayWidth =
    zoom === "day" ? WORK_HOURS * 30 : zoom === "week" ? 120 : 36;
  const totalWidth = TOTAL_DAYS * dayWidth;
  const hourWidth = dayWidth / WORK_HOURS;

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

  // Kumulativne pozicije dana za sve zoom nivoe (override dani su proporcionalno širi)
  const pxPerHour = zoom === "day" ? 30 : zoom === "week" ? 15 : 4.5;
  const dayPositions = useMemo(() => {
    const positions: { left: number; width: number; hours: number }[] = [];
    let x = 0;
    for (let i = 0; i < TOTAL_DAYS; i++) {
      const maxH = getDayMaxHours(i);
      const w = maxH * pxPerHour;
      positions.push({ left: x, width: w, hours: maxH });
      x += w;
    }
    return positions;
  }, [pxPerHour, getDayMaxHours]);

  const dynamicTotalWidth = dayPositions
    ? dayPositions[dayPositions.length - 1].left + dayPositions[dayPositions.length - 1].width
    : totalWidth;

  const dayHasOverride = useCallback((dayIdx: number): boolean => {
    const day = addDays(ganttStartDate, dayIdx);
    return machines.some((m) => {
      const wh = getWorkingHours(m.id, day, overrides);
      return wh !== null && wh.hours > WORK_HOURS;
    });
  }, [ganttStartDate, machines, overrides]);

  // Generiraj dane
  const days = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < TOTAL_DAYS; i++) {
      result.push(addDays(ganttStartDate, i));
    }
    return result;
  }, [ganttStartDate]);

  // Mjesečne grupe za gornji header red (tjedan/mjesec zoom)
  const monthGroups = useMemo(() => {
    if (zoom === "day") return null;
    const groups: { label: string; left: number; width: number }[] = [];
    let curMonth = -1, curYear = -1;
    let groupLeft = 0, groupWidth = 0;

    for (let i = 0; i < TOTAL_DAYS; i++) {
      const d = days[i];
      const m = d.getMonth(), y = d.getFullYear();
      const w = dayPositions[i].width;

      if (m !== curMonth || y !== curYear) {
        if (curMonth !== -1) {
          groups.push({ label: `${MONTH_NAMES_HR[curMonth]} ${curYear}`, left: groupLeft, width: groupWidth });
        }
        curMonth = m; curYear = y;
        groupLeft = dayPositions[i].left;
        groupWidth = w;
      } else {
        groupWidth += w;
      }
    }
    if (curMonth !== -1) {
      groups.push({ label: `${MONTH_NAMES_HR[curMonth]} ${curYear}`, left: groupLeft, width: groupWidth });
    }
    return groups;
  }, [zoom, days, dayPositions]);

  // Trenutno vrijeme — clamp na radne sate (07:00 - 15:00)
  const now = new Date();
  const todayDayIdx = differenceInCalendarDays(startOfDay(now), ganttStartDate);

  let nowOffset: number | null = null;
  if (todayDayIdx >= 0 && todayDayIdx < TOTAL_DAYS) {
    const hour = now.getHours() + now.getMinutes() / 60;
    const clamped = Math.max(WORKDAY_START, Math.min(WORKDAY_END, hour));

    if (dayPositions) {
      const dp = dayPositions[todayDayIdx];
      const frac = (clamped - WORKDAY_START) / dp.hours;
      nowOffset = dp.left + frac * dp.width;
    } else {
      const frac = (clamped - WORKDAY_START) / WORK_HOURS;
      nowOffset = todayDayIdx * dayWidth + frac * dayWidth;
    }
  }

  // Scroll na "danas"
  const scrollToToday = () => {
    if (scrollRef.current && nowOffset !== null) {
      scrollRef.current.scrollLeft = Math.max(0, nowOffset - 200);
    }
  };

  // Snap delta piksela na dane, preskoči vikende osim ako postoji override
  const snapDeltaToDays = useCallback(
    (deltaPx: number, originalDayIdx: number): number => {
      const effectiveDayWidth = dayPositions
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
        if (!isWeekend(d) || dayHasOverride(targetIdx)) {
          remaining--;
        }
      }

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

  // Izračunaj ciljni datum iz drag statea
  const getDragTargetDate = useCallback((): string | null => {
    if (!dragState || !dragState.isDragging) return null;
    const snappedDelta = snapDeltaToDays(dragDeltaPx, dragState.originalDayIdx);
    const targetDayIdx = dragState.originalDayIdx + snappedDelta;
    if (targetDayIdx < 0 || targetDayIdx >= TOTAL_DAYS) return null;
    const targetDate = addDays(ganttStartDate, targetDayIdx);
    if (isWeekend(targetDate) && !dayHasOverride(targetDayIdx)) return null;
    return format(targetDate, "yyyy-MM-dd");
  }, [dragState, dragDeltaPx, snapDeltaToDays, ganttStartDate, dayHasOverride]);

  const getDragSnappedOffsetPx = useCallback((): number => {
    if (!dragState || !dragState.isDragging) return 0;
    const snappedDelta = snapDeltaToDays(dragDeltaPx, dragState.originalDayIdx);
    if (dayPositions) {
      // Sum widths of days from original to target
      let offset = 0;
      const start = dragState.originalDayIdx;
      const end = dragState.originalDayIdx + snappedDelta;
      const step = snappedDelta > 0 ? 1 : -1;
      for (let i = start; i !== end; i += step) {
        offset += dayPositions[i].width * step;
      }
      return offset;
    }
    return snappedDelta * dayWidth;
  }, [dragState, dragDeltaPx, snapDeltaToDays, dayWidth, dayPositions, zoom]);

  // Je li nalog draggable?
  const canDrag = (s: ScheduledOrder): boolean => {
    if (s.status === "ZAKAZANO") return false;
    if (s.order.izvedba === "ZAVRŠEN") return false;
    if (s.order.zeljeni_redoslijed !== null) return false;
    return true;
  };

  // Pointer handleri
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, s: ScheduledOrder) => {
      if (!canDrag(s) || !onMoveOrder) return;
      if (!s.start) return;

      const dayIdx = differenceInCalendarDays(startOfDay(s.start!), ganttStartDate);

      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragState({
        orderId: s.order.id,
        startX: e.clientX,
        originalDayIdx: dayIdx,
        isDragging: false,
      });
      setDragDeltaPx(0);
    },
    [ganttStartDate, onMoveOrder]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState) return;
      const delta = e.clientX - dragState.startX;

      if (!dragState.isDragging && Math.abs(delta) > MIN_DRAG_PX) {
        setDragState((prev) => prev ? { ...prev, isDragging: true } : null);
        setTooltip(null); // Sakrij tooltip tokom draga
      }

      if (dragState.isDragging || Math.abs(delta) > MIN_DRAG_PX) {
        setDragDeltaPx(delta);
      }
    },
    [dragState]
  );

  const handlePointerUp = useCallback(() => {
    if (!dragState) return;

    if (dragState.isDragging && onMoveOrder) {
      dragOccurredRef.current = true;
      setTimeout(() => { dragOccurredRef.current = false; }, 0);
      const targetDate = getDragTargetDate();
      if (targetDate) {
        onMoveOrder(dragState.orderId, targetDate);
      }
    }

    setDragState(null);
    setDragDeltaPx(0);
  }, [dragState, onMoveOrder, getDragTargetDate]);

  // Izračunaj segmente trake po radnim danima (preskače vikende + noći)
  const getBarSegments = (s: ScheduledOrder): BarSegment[] => {
    if (!s.start || !s.end) return [];
    const segments: BarSegment[] = [];
    const startDayIdx = differenceInCalendarDays(startOfDay(s.start), ganttStartDate);
    const endDayIdx = differenceInCalendarDays(startOfDay(s.end), ganttStartDate);

    for (let dayIdx = startDayIdx; dayIdx <= endDayIdx; dayIdx++) {
      if (dayIdx < 0 || dayIdx >= TOTAL_DAYS) continue;
      const day = addDays(ganttStartDate, dayIdx);

      const wh = getWorkingHours(s.order.machine_id, day, overrides);
      if (!wh) continue;

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

      if (dayPositions) {
        const dp = dayPositions[dayIdx];
        const dpPxPerHour = dp.width / dp.hours;
        const startFrac = startH - wh.start;
        const endFrac = endH - wh.start;
        segments.push({
          left: dp.left + startFrac * dpPxPerHour,
          width: Math.max((endFrac - startFrac) * dpPxPerHour, 2),
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

  // Iscrtane linije za vikend praznine između segmenata
  const getWeekendGaps = (
    segments: BarSegment[]
  ): { left: number; width: number }[] => {
    const gaps: { left: number; width: number }[] = [];
    for (let i = 0; i < segments.length - 1; i++) {
      const endCurrent = segments[i].left + segments[i].width;
      const startNext = segments[i + 1].left;
      if (startNext > endCurrent + 1) {
        gaps.push({ left: endCurrent, width: startNext - endCurrent });
      }
    }
    return gaps;
  };

  const machineRows = useMemo(() => {
    const rows: { machine: Machine; items: ScheduledOrder[] }[] = [];
    for (const m of machines) {
      const items = scheduled.filter(
        (s) => s.order.machine_id === m.id && s.start && s.end
      );
      rows.push({ machine: m, items });
    }
    return rows;
  }, [machines, scheduled]);

  const ROW_HEIGHT = 40;

  // Sati za "Dan" zoom header
  const hours = useMemo(() => {
    const result: number[] = [];
    for (let h = WORKDAY_START; h < WORKDAY_END; h++) {
      result.push(h);
    }
    return result;
  }, []);

  // Drag ghost offset (snapped to days)
  const ghostOffset = getDragSnappedOffsetPx();
  const dragTargetDate = getDragTargetDate();

  return (
    <div className="bg-white border-t flex flex-col">
      {/* Zoom toggle + Danas button */}
      <div className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0">
        <span className="text-xs text-gray-500">Zoom:</span>
        {(["day", "week", "month"] as const).map((level) => (
          <button
            key={level}
            onClick={() => setZoom(level)}
            className={`text-xs px-2 py-0.5 rounded ${
              zoom === level
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {level === "day" ? "Dan" : level === "week" ? "Tjedan" : "Mjesec"}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={scrollToToday}
          className="text-xs px-2.5 py-1 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-medium"
        >
          ← Danas
        </button>
      </div>

      <div ref={scrollRef} className="overflow-x-auto flex-1 min-h-0 overflow-y-auto">
        <div style={{ width: dynamicTotalWidth + 100 }} className="relative">
          {/* Header */}
          {zoom === "day" && dayPositions ? (
            <div style={{ marginLeft: 100 }}>
              {/* Red s datumima */}
              <div className="flex">
                {days.map((day, i) => {
                  const weekend = getDay(day) === 0 || getDay(day) === 6;
                  const dp = dayPositions[i];
                  const hasOv = dayHasOverride(i);
                  return (
                    <div
                      key={i}
                      className={`flex-shrink-0 text-center text-[10px] border-r border-gray-200 py-0.5 font-medium ${
                        weekend
                          ? "bg-gray-100 text-gray-400"
                          : hasOv
                          ? "bg-yellow-50 text-yellow-700"
                          : "text-gray-600"
                      }`}
                      style={{ width: dp.width }}
                    >
                      {formatDayShort(day)}{hasOv ? " ⚡" : ""}
                    </div>
                  );
                })}
              </div>
              {/* Red sa satima */}
              <div className="flex">
                {days.map((day, dayIdx) => {
                  const weekend = getDay(day) === 0 || getDay(day) === 6;
                  const dp = dayPositions[dayIdx];
                  const maxH = dp.hours;
                  const hWidth = dp.width / maxH;
                  const dayHours: number[] = [];
                  for (let h = WORKDAY_START; h < WORKDAY_START + maxH; h++) {
                    dayHours.push(h);
                  }
                  return (
                    <div
                      key={dayIdx}
                      className="flex flex-shrink-0"
                      style={{ width: dp.width }}
                    >
                      {dayHours.map((h) => (
                        <div
                          key={h}
                          className={`text-center text-[8px] border-r border-gray-100 py-0.5 ${
                            weekend
                              ? "bg-gray-100 text-gray-300"
                              : h >= WORKDAY_END
                              ? "bg-yellow-50 text-yellow-600"
                              : "text-gray-400"
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
          ) : zoom === "day" ? (
            /* Fallback for day zoom without dayPositions (shouldn't happen) */
            <div style={{ marginLeft: 100 }}>
              <div className="flex">
                {days.map((day, i) => {
                  const weekend = getDay(day) === 0 || getDay(day) === 6;
                  return (
                    <div
                      key={i}
                      className={`flex-shrink-0 text-center text-[10px] border-r border-gray-200 py-0.5 font-medium ${
                        weekend ? "bg-gray-100 text-gray-400" : "text-gray-600"
                      }`}
                      style={{ width: dayWidth }}
                    >
                      {formatDayShort(day)}
                    </div>
                  );
                })}
              </div>
              <div className="flex">
                {days.map((day, dayIdx) => {
                  const weekend = getDay(day) === 0 || getDay(day) === 6;
                  return (
                    <div key={dayIdx} className="flex flex-shrink-0" style={{ width: dayWidth }}>
                      {hours.map((h) => (
                        <div
                          key={h}
                          className={`text-center text-[8px] border-r border-gray-100 py-0.5 ${
                            weekend ? "bg-gray-100 text-gray-300" : "text-gray-400"
                          }`}
                          style={{ width: hourWidth }}
                        >
                          {String(h).padStart(2, "0")}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Tjedan/Mjesec zoom: dvoslojni header (mjeseci + dani) */
            <div style={{ marginLeft: 100 }}>
              {/* Gornji red: Mjeseci */}
              <div className="flex">
                {monthGroups?.map((mg, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 text-center text-[10px] border-r border-b border-gray-300 py-0.5 font-semibold text-gray-700 bg-gray-50"
                    style={{ width: mg.width }}
                  >
                    {mg.label}
                  </div>
                ))}
              </div>
              {/* Donji red: Dani */}
              <div className="flex">
                {days.map((day, i) => {
                  const weekend = getDay(day) === 0 || getDay(day) === 6;
                  const hasOv = dayHasOverride(i);
                  const dayLabel = zoom === "week"
                    ? `${DAY_NAMES_SHORT[getDay(day)]} ${day.getDate()}.`
                    : `${day.getDate()}.`;
                  return (
                    <div
                      key={i}
                      className={`flex-shrink-0 text-center text-[10px] border-r border-gray-200 py-0.5 ${
                        weekend
                          ? "bg-gray-100 text-gray-400"
                          : hasOv
                          ? "bg-yellow-50 text-yellow-700"
                          : "text-gray-600"
                      }`}
                      style={{ width: dayPositions?.[i]?.width ?? dayWidth }}
                    >
                      {dayLabel}{hasOv ? " ⚡" : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rows po stroju */}
          {machineRows.map(({ machine, items }, rowIdx) => (
            <div
              key={machine.id}
              className="flex border-b border-gray-100"
              style={{ height: ROW_HEIGHT }}
            >
              {/* Naziv stroja */}
              <div
                className="flex items-center px-2 text-xs font-medium flex-shrink-0 border-r sticky left-0 z-10"
                style={{
                  width: 100,
                  backgroundColor: machine.color_light,
                  color: machine.color,
                }}
              >
                {machine.name}
              </div>

              {/* Timeline area */}
              <div
                className="relative flex-1"
                style={{ width: dynamicTotalWidth }}
              >
                {/* Vikend šrafure */}
                {days.map((day, i) => {
                  const weekend = getDay(day) === 0 || getDay(day) === 6;
                  if (!weekend) return null;
                  const left = dayPositions ? dayPositions[i].left : i * dayWidth;
                  const w = dayPositions ? dayPositions[i].width : dayWidth;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 bg-gray-50"
                      style={{
                        left,
                        width: w,
                        backgroundImage:
                          "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.03) 6px)",
                      }}
                    />
                  );
                })}

                {/* Override markers (tjedan/mjesec zoom) */}
                {zoom !== "day" && days.map((day, i) => {
                  const wh = getWorkingHours(machine.id, day, overrides);
                  if (!wh || wh.hours <= WORK_HOURS) return null;
                  const ovLeft = dayPositions?.[i]?.left ?? i * dayWidth;
                  const ovWidth = dayPositions?.[i]?.width ?? dayWidth;
                  return (
                    <div
                      key={`ov-${i}`}
                      className="absolute bottom-0.5 text-[7px] text-yellow-600 pointer-events-none"
                      style={{ left: ovLeft + 2, width: ovWidth - 4, textAlign: "center" }}
                      title={`${wh.start}:00-${wh.end}:00 (${wh.hours}h)`}
                    >
                      ⚡
                    </div>
                  );
                })}

                {/* Dan separatori */}
                {days.map((_, i) => (
                  <div
                    key={`sep-${i}`}
                    className="absolute top-0 bottom-0 border-r border-gray-100"
                    style={{ left: dayPositions ? dayPositions[i].left : i * dayWidth }}
                  />
                ))}

                {/* Sat separatori (Dan zoom) */}
                {zoom === "day" && dayPositions &&
                  days.map((_, dayIdx) => {
                    const dp = dayPositions[dayIdx];
                    const hWidth = dp.width / dp.hours;
                    return Array.from({ length: Math.floor(dp.hours) }, (_, hIdx) => (
                      <div
                        key={`hsep-${dayIdx}-${hIdx}`}
                        className="absolute top-0 bottom-0 border-r border-gray-50"
                        style={{
                          left: dp.left + hIdx * hWidth,
                        }}
                      />
                    ));
                  })}

                {/* Trenutno vrijeme marker (crvena linija) */}
                {nowOffset !== null && (
                  <div
                    className="absolute top-0 bottom-0 border-l-2 border-red-500 z-20 pointer-events-none"
                    style={{ left: nowOffset }}
                  >
                    {rowIdx === 0 && (
                      <span className="absolute -top-4 -left-3 text-[8px] text-red-500 font-bold bg-white px-0.5 whitespace-nowrap">
                        SADA
                      </span>
                    )}
                  </div>
                )}

                {/* Trakovi naloga — segmentirani po radnim danima */}
                {items.map((s) => {
                  const segments = getBarSegments(s);
                  if (segments.length === 0) return null;
                  const gaps = getWeekendGaps(segments);
                  const isOverlap = s.status === "PREKLAPANJE";
                  const isExpired = s.stanje === "ROK ISTEKAO";
                  const barColor = isOverlap ? "#F4CCCC" : isExpired ? "#DC2626" : machine.color;
                  const isThisHovered = hoveredOrderId === s.order.id
                    || (!!hoveredSplitGroup && s.order.split_group_id === hoveredSplitGroup);
                  const somethingHovered = hoveredOrderId != null || hoveredSplitGroup != null;
                  const isBeingDragged = dragState?.orderId === s.order.id && dragState.isDragging;
                  const isPinned = s.order.najraniji_pocetak !== null;
                  const isCeka = sirovineEnabled && s.order.status_sirovine === "CEKA";
                  const isTentative = s.status === "ZAKAZANO";
                  const draggable = canDrag(s);

                  const baseOpacity =
                    s.order.izvedba === "ZAVRŠEN" ? 0.4 : isTentative ? 0.3 : 0.85;
                  const opacity = isBeingDragged
                    ? 0.4
                    : somethingHovered
                    ? isThisHovered
                      ? 1
                      : 0.25
                    : baseOpacity;

                  // Ukupna širina za label
                  const totalLeft = segments[0].left;
                  const totalRight =
                    segments[segments.length - 1].left +
                    segments[segments.length - 1].width;

                  return (
                    <div key={s.order.id}>
                      {/* Iscrtane linije preko vikenda */}
                      {gaps.map((gap, gi) => (
                        <div
                          key={`gap-${gi}`}
                          className="absolute pointer-events-none"
                          style={{
                            left: gap.left,
                            width: gap.width,
                            top: ROW_HEIGHT / 2 - 1,
                            height: 0,
                            borderTop: `2px dashed ${machine.color}`,
                            opacity: somethingHovered && !isThisHovered ? 0.1 : 0.35,
                          }}
                        />
                      ))}

                      {/* Ghost preview tokom draga */}
                      {isBeingDragged && segments.map((seg, si) => (
                        <div
                          key={`ghost-${si}`}
                          className="absolute rounded-sm pointer-events-none border-2 border-dashed border-blue-400"
                          style={{
                            left: seg.left + ghostOffset,
                            width: seg.width,
                            top: 5,
                            height: ROW_HEIGHT - 10,
                            backgroundColor: machine.color,
                            opacity: 0.5,
                          }}
                        >
                          {si === 0 && dragTargetDate && (
                            <span className="absolute -top-4 left-0 text-[8px] font-bold text-blue-600 bg-white px-1 rounded shadow-sm whitespace-nowrap z-30">
                              {formatDayShort(new Date(dragTargetDate + "T00:00:00"))}
                            </span>
                          )}
                        </div>
                      ))}

                      {/* Solid segmenti */}
                      {segments.map((seg, si) => (
                        <div
                          key={`seg-${si}`}
                          className={`absolute rounded-sm transition-all duration-150 ${
                            isOverlap ? "border-2 border-red-500" : s.order.hitni_rok ? "border-2 border-red-600" : isTentative ? "border-2 border-dashed" : ""
                          } ${isThisHovered && !isBeingDragged ? "ring-2 ring-blue-400 z-10" : ""} ${
                            draggable && onMoveOrder ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                          }`}
                          style={{
                            left: seg.left,
                            width: seg.width,
                            top: isThisHovered && !isBeingDragged ? 3 : 5,
                            height: isThisHovered && !isBeingDragged ? ROW_HEIGHT - 6 : ROW_HEIGHT - 10,
                            backgroundColor: barColor,
                            opacity,
                            ...(isTentative ? { borderColor: machine.color } : {}),
                          }}
                          onClick={() => {
                            if (!dragOccurredRef.current) {
                              onClickOrder?.(s.order.id);
                            }
                          }}
                          onPointerDown={(e) => {
                            if (si === 0) handlePointerDown(e, s);
                          }}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          onMouseEnter={(e) => {
                            if (!dragState) {
                              onHoverOrder?.(s.order.id);
                              setTooltip({
                                order: s,
                                x: e.clientX,
                                y: e.clientY,
                              });
                            }
                          }}
                          onMouseLeave={() => {
                            if (!dragState) {
                              onHoverOrder?.(null);
                              setTooltip(null);
                            }
                          }}
                        >
                          {si === 0 && (
                            <span className={`text-white text-[9px] px-1 truncate block ${isThisHovered && !isBeingDragged ? "leading-[34px]" : "leading-[30px]"}`}>
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
                              {isCeka && "⏳ "}
                              {totalRight - totalLeft > 40 ? (
                                s.order.split_label
                                  ? `${s.order.rn_id} (${s.order.split_label})`
                                  : s.order.rn_id
                              ) : ""}
                            </span>
                          )}
                        </div>
                      ))}

                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && !dragState?.isDragging && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs rounded shadow-lg px-3 py-2 pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 60 }}
        >
          <div className="font-bold">
            {tooltip.order.order.hitni_rok && "🚨 "}
            {tooltip.order.order.najraniji_pocetak !== null && "⏳ "}
            {tooltip.order.order.rn_id}
            {tooltip.order.order.split_label && ` (Dio ${tooltip.order.order.split_label})`}
          </div>
          {tooltip.order.order.opis && (
            <div className="text-gray-300">
              {tooltip.order.order.opis}
            </div>
          )}
          {tooltip.order.start && (
            <div>
              {formatDayDate(tooltip.order.start)}{" "}
              {formatTime(tooltip.order.start)} →{" "}
              {tooltip.order.end && (
                <>
                  {formatDayDate(tooltip.order.end)}{" "}
                  {formatTime(tooltip.order.end)}
                </>
              )}
            </div>
          )}
          <div>Trajanje: {formatDuration(tooltip.order.order.trajanje_h)}</div>
          {sirovineEnabled && tooltip.order.order.status_sirovine && (
            <div className="text-gray-300">
              Sirovina: {tooltip.order.order.status_sirovine === "IMA" ? "IMA" : tooltip.order.order.status_sirovine === "NEMA" ? "NEMA" : "ČEKA"}
            </div>
          )}
          {tooltip.order.order.hitni_rok && (
            <div className="text-red-300 font-bold">🚨 Hitni rok: {tooltip.order.order.hitni_rok.split("-").reverse().join(".")}</div>
          )}
          {tooltip.order.stanje === "ROK ISTEKAO" && (
            <div className="text-red-300 font-bold">ROK ISTEKAO</div>
          )}
          {tooltip.order.status === "ZAKAZANO" && (
            <div className="text-blue-300">Tentativni raspored (rok izvan horizonta)</div>
          )}
          {tooltip.order.status !== "OK" && tooltip.order.status !== "ZAKAZANO" && (
            <div className="text-red-300 font-bold">
              {tooltip.order.status}
            </div>
          )}
          {tooltip.order.order.split_group_id && (() => {
            const sibling = scheduled.find(
              (s) => s.order.split_group_id === tooltip.order.order.split_group_id
                && s.order.id !== tooltip.order.order.id
            );
            if (!sibling) return null;
            const sibMachine = machines.find((m) => m.id === sibling.order.machine_id);
            return (
              <div className="text-blue-300 text-[9px] mt-0.5">
                Parnjak: Dio {sibling.order.split_label} na {sibMachine?.name ?? "—"}
              </div>
            );
          })()}
          {tooltip.order.order.najraniji_pocetak !== null && (
            <div className="text-blue-300 text-[9px] mt-0.5">
              Ne prije {tooltip.order.order.najraniji_pocetak} • klikni ⏳ za uklanjanje
            </div>
          )}
        </div>
      )}

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
    </div>
  );
}
