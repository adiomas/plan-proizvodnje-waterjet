"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { hr } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const DAY_LABELS = ["po", "ut", "sr", "če", "pe", "su", "ne"];

function isoToDisplay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function parseDateInput(v: string): string | null {
  const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ------------------------------------------------------------------ */
/*  CalendarPopover                                                   */
/* ------------------------------------------------------------------ */

function CalendarPopover({
  selected,
  onSelect,
  onClose,
  anchorRef,
}: {
  selected: Date | null;
  onSelect: (d: Date) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [viewMonth, setViewMonth] = useState(
    () => selected ?? new Date()
  );
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const [visible, setVisible] = useState(false);

  // Position relative to anchor element — measure actual calendar height
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const cal = ref.current;
    if (!anchor || !cal) return;
    const updatePos = () => {
      const rect = anchor.getBoundingClientRect();
      const calRect = cal.getBoundingClientRect();
      const calH = calRect.height;
      const calW = calRect.width;
      let top = rect.bottom + 4;
      let left = rect.left;
      // Flip up if no room below
      if (top + calH > window.innerHeight) {
        top = rect.top - calH - 4;
      }
      // Keep within viewport horizontally
      if (left + calW > window.innerWidth) {
        left = window.innerWidth - calW - 8;
      }
      setPos({ top, left });
      setVisible(true);
    };
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const monthLabel = format(viewMonth, "LLLL yyyy", { locale: hr });

  return createPortal(
    <div
      ref={ref}
      onMouseDown={(e) => e.preventDefault()}
      style={{ position: "fixed", top: pos.top, left: pos.left, visibility: visible ? "visible" : "hidden" }}
      className="z-[9999] bg-white rounded-lg shadow-lg border border-gray-200 p-2 w-[240px] select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5 px-1">
        <button
          type="button"
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-xs font-semibold text-gray-700 capitalize">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-0.5">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-medium text-gray-400 py-0.5"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = isSameMonth(day, viewMonth);
          const isSelected = selected && isSameDay(day, selected);
          const today = isToday(day);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(day)}
              className={`
                h-7 w-full text-[11px] rounded-md transition-colors
                ${!inMonth ? "text-gray-300" : "text-gray-700 hover:bg-gray-100"}
                ${isSelected ? "!bg-blue-600 !text-white font-semibold" : ""}
                ${today && !isSelected ? "font-semibold text-blue-600 ring-1 ring-inset ring-blue-200" : ""}
              `}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      {/* Footer: Today shortcut */}
      <div className="mt-1 pt-1 border-t border-gray-100 flex justify-center">
        <button
          type="button"
          onClick={() => onSelect(new Date())}
          className="text-[10px] text-blue-600 hover:text-blue-700 font-medium px-2 py-0.5 rounded hover:bg-blue-50 transition-colors"
        >
          Danas
        </button>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/*  CalendarIcon                                                      */
/* ------------------------------------------------------------------ */

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  DateInput                                                         */
/* ------------------------------------------------------------------ */

interface DateInputProps {
  /** ISO date yyyy-mm-dd */
  value: string;
  /** Display string dd.mm.yyyy */
  displayValue: string;
  /** Called when a valid date is selected (from calendar or valid text) */
  onChange: (iso: string, display: string) => void;
  /** Called on every keystroke in the text input */
  onDisplayChange: (display: string) => void;
  placeholder?: string;
  className?: string;
  /** Auto-focus the text input on mount */
  autoFocus?: boolean;
  /** Called when text input loses focus */
  onBlur?: () => void;
  /** Called on keydown in the text input */
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export function DateInput({
  value,
  displayValue,
  onChange,
  onDisplayChange,
  placeholder = "dd.mm.yyyy",
  className = "",
  autoFocus,
  onBlur,
  onKeyDown,
}: DateInputProps) {
  const [calOpen, setCalOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleCalSelect = useCallback(
    (day: Date) => {
      const iso = toIso(day);
      const disp = isoToDisplay(iso);
      onChange(iso, disp);
      setCalOpen(false);
    },
    [onChange]
  );

  const closeCalendar = useCallback(() => setCalOpen(false), []);

  const selectedDate = value
    ? new Date(value + "T00:00:00")
    : null;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={(e) => {
          onDisplayChange(e.target.value);
          const iso = parseDateInput(e.target.value);
          if (iso) onChange(iso, e.target.value);
        }}
        placeholder={placeholder}
        className={`${className} pr-8`}
        autoFocus={autoFocus}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === "Escape" && calOpen) {
            e.stopPropagation();
            setCalOpen(false);
            return;
          }
          onKeyDown?.(e);
        }}
      />
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          setCalOpen((o) => !o);
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
        tabIndex={-1}
      >
        <CalendarIcon />
      </button>
      {calOpen && (
        <CalendarPopover
          selected={selectedDate}
          onSelect={handleCalSelect}
          onClose={closeCalendar}
          anchorRef={wrapperRef}
        />
      )}
    </div>
  );
}

export { isoToDisplay, parseDateInput };
