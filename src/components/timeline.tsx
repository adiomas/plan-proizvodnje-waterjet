"use client";

import { useMemo, useRef, useState } from "react";
import { addDays, startOfDay, getDay } from "date-fns";
import type { Machine, ScheduledOrder } from "@/lib/types";
import {
  formatDayDate,
  formatTime,
  WORKDAY_START,
  WORKDAY_END,
  isWeekend,
} from "@/lib/utils";

interface TimelineProps {
  machines: Machine[];
  scheduled: ScheduledOrder[];
  ganttStartDate: Date;
}

type ZoomLevel = "day" | "week" | "month";

const TOTAL_DAYS = 183; // ~6 mjeseci
const WORK_HOURS = WORKDAY_END - WORKDAY_START; // 8 sati

interface BarSegment {
  left: number;
  width: number;
}

export function Timeline({
  machines,
  scheduled,
  ganttStartDate,
}: TimelineProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const [tooltip, setTooltip] = useState<{
    order: ScheduledOrder;
    x: number;
    y: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dayWidth =
    zoom === "day" ? WORK_HOURS * 20 : zoom === "week" ? 80 : 24;
  const totalWidth = TOTAL_DAYS * dayWidth;
  const hourWidth = dayWidth / WORK_HOURS;

  const ganttStartMs = useMemo(
    () => startOfDay(ganttStartDate).getTime(),
    [ganttStartDate]
  );
  const msPerDay = 1000 * 60 * 60 * 24;

  // Generiraj dane
  const days = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < TOTAL_DAYS; i++) {
      result.push(addDays(ganttStartDate, i));
    }
    return result;
  }, [ganttStartDate]);

  // Trenutno vrijeme — clamp na radne sate (07:00 - 15:00)
  const now = new Date();
  const todayDayIdx = Math.floor(
    (startOfDay(now).getTime() - ganttStartMs) / msPerDay
  );

  let nowOffset: number | null = null;
  if (todayDayIdx >= 0 && todayDayIdx < TOTAL_DAYS) {
    const hour = now.getHours() + now.getMinutes() / 60;
    const clamped = Math.max(WORKDAY_START, Math.min(WORKDAY_END, hour));
    const frac = (clamped - WORKDAY_START) / WORK_HOURS;
    nowOffset = todayDayIdx * dayWidth + frac * dayWidth;
  }

  // Scroll na "danas"
  const scrollToToday = () => {
    if (scrollRef.current && nowOffset !== null) {
      scrollRef.current.scrollLeft = Math.max(0, nowOffset - 200);
    }
  };

  // Izračunaj segmente trake po radnim danima (preskače vikende + noći)
  const getBarSegments = (s: ScheduledOrder): BarSegment[] => {
    if (!s.start || !s.end) return [];

    const segments: BarSegment[] = [];

    const startDayIdx = Math.floor(
      (startOfDay(s.start).getTime() - ganttStartMs) / msPerDay
    );
    const endDayIdx = Math.floor(
      (startOfDay(s.end).getTime() - ganttStartMs) / msPerDay
    );

    for (let dayIdx = startDayIdx; dayIdx <= endDayIdx; dayIdx++) {
      if (dayIdx < 0 || dayIdx >= TOTAL_DAYS) continue;
      const day = addDays(ganttStartDate, dayIdx);
      if (isWeekend(day)) continue;

      // Odredi radne sate za ovaj dan
      let startH = WORKDAY_START;
      if (dayIdx === startDayIdx) {
        const h = s.start.getHours() + s.start.getMinutes() / 60;
        startH = Math.max(WORKDAY_START, Math.min(WORKDAY_END, h));
      }

      let endH = WORKDAY_END;
      if (dayIdx === endDayIdx) {
        const h = s.end.getHours() + s.end.getMinutes() / 60;
        endH = Math.max(WORKDAY_START, Math.min(WORKDAY_END, h));
      }

      if (endH <= startH) continue;

      const startFrac = (startH - WORKDAY_START) / WORK_HOURS;
      const endFrac = (endH - WORKDAY_START) / WORK_HOURS;

      segments.push({
        left: dayIdx * dayWidth + startFrac * dayWidth,
        width: Math.max((endFrac - startFrac) * dayWidth, 2),
      });
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

  const ROW_HEIGHT = 36;

  // Sati za "Dan" zoom header
  const hours = useMemo(() => {
    const result: number[] = [];
    for (let h = WORKDAY_START; h < WORKDAY_END; h++) {
      result.push(h);
    }
    return result;
  }, []);

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
        <div style={{ width: totalWidth + 100 }} className="relative">
          {/* Header */}
          {zoom === "day" ? (
            /* Dan zoom: datum + sati */
            <div style={{ marginLeft: 100 }}>
              {/* Red s datumima */}
              <div className="flex">
                {days.map((day, i) => {
                  const weekend = getDay(day) === 0 || getDay(day) === 6;
                  return (
                    <div
                      key={i}
                      className={`flex-shrink-0 text-center text-[10px] border-r border-gray-200 py-0.5 font-medium ${
                        weekend
                          ? "bg-gray-100 text-gray-400"
                          : "text-gray-600"
                      }`}
                      style={{ width: dayWidth }}
                    >
                      {formatDayDate(day)}
                    </div>
                  );
                })}
              </div>
              {/* Red sa satima */}
              <div className="flex">
                {days.map((day, dayIdx) => {
                  const weekend = getDay(day) === 0 || getDay(day) === 6;
                  return (
                    <div
                      key={dayIdx}
                      className="flex flex-shrink-0"
                      style={{ width: dayWidth }}
                    >
                      {hours.map((h) => (
                        <div
                          key={h}
                          className={`text-center text-[8px] border-r border-gray-100 py-0.5 ${
                            weekend
                              ? "bg-gray-100 text-gray-300"
                              : "text-gray-400"
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
            /* Tjedan/Mjesec zoom: samo datumi */
            <div className="flex" style={{ marginLeft: 100 }}>
              {days.map((day, i) => {
                const weekend = getDay(day) === 0 || getDay(day) === 6;
                return (
                  <div
                    key={i}
                    className={`flex-shrink-0 text-center text-[10px] border-r border-gray-200 py-1 ${
                      weekend
                        ? "bg-gray-100 text-gray-400"
                        : "text-gray-600"
                    }`}
                    style={{ width: dayWidth }}
                  >
                    {zoom === "week"
                      ? formatDayDate(day)
                      : `${day.getDate()}.`}
                  </div>
                );
              })}
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
                style={{ width: totalWidth }}
              >
                {/* Vikend šrafure */}
                {days.map((day, i) => {
                  const weekend = getDay(day) === 0 || getDay(day) === 6;
                  if (!weekend) return null;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 bg-gray-50"
                      style={{
                        left: i * dayWidth,
                        width: dayWidth,
                        backgroundImage:
                          "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.03) 6px)",
                      }}
                    />
                  );
                })}

                {/* Dan separatori */}
                {days.map((_, i) => (
                  <div
                    key={`sep-${i}`}
                    className="absolute top-0 bottom-0 border-r border-gray-100"
                    style={{ left: i * dayWidth }}
                  />
                ))}

                {/* Sat separatori (Dan zoom) */}
                {zoom === "day" &&
                  days.map((_, dayIdx) =>
                    hours.map((_, hIdx) => (
                      <div
                        key={`hsep-${dayIdx}-${hIdx}`}
                        className="absolute top-0 bottom-0 border-r border-gray-50"
                        style={{
                          left: dayIdx * dayWidth + hIdx * hourWidth,
                        }}
                      />
                    ))
                  )}

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
                  const barColor = isOverlap ? "#F4CCCC" : machine.color;
                  const opacity =
                    s.order.izvedba === "ZAVRŠEN" ? 0.4 : 0.85;

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
                            opacity: 0.35,
                          }}
                        />
                      ))}

                      {/* Solid segmenti */}
                      {segments.map((seg, si) => (
                        <div
                          key={`seg-${si}`}
                          className={`absolute rounded-sm cursor-pointer transition-opacity hover:opacity-90 ${
                            isOverlap ? "border-2 border-red-500" : ""
                          }`}
                          style={{
                            left: seg.left,
                            width: seg.width,
                            top: 4,
                            height: ROW_HEIGHT - 8,
                            backgroundColor: barColor,
                            opacity,
                          }}
                          onMouseEnter={(e) =>
                            setTooltip({
                              order: s,
                              x: e.clientX,
                              y: e.clientY,
                            })
                          }
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {si === 0 &&
                            totalRight - totalLeft > 40 && (
                              <span className="text-white text-[9px] px-1 truncate block leading-[28px]">
                                {s.order.rn_id}
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
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs rounded shadow-lg px-3 py-2 pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 60 }}
        >
          <div className="font-bold">{tooltip.order.order.rn_id}</div>
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
          <div>Trajanje: {tooltip.order.order.trajanje_h}h</div>
          {tooltip.order.status !== "OK" && (
            <div className="text-red-300 font-bold">
              {tooltip.order.status}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
