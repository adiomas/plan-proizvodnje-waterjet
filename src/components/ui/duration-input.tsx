"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

export function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const PRESET_GROUPS = [
  { label: null, values: [0.25, 0.5, 0.75, 1, 1.5, 2] },
  { label: null, values: [2.5, 3, 4, 5, 6, 8] },
  { label: null, values: [10, 12, 16, 20, 24, 32] },
];

const MIN_VALUE = 0.25;
const STEP_FINE = 0.25;  // 15min
const STEP_HOUR = 1;     // 1h

/* ------------------------------------------------------------------ */
/*  DurationPopover                                                   */
/* ------------------------------------------------------------------ */

function DurationPopover({
  onSelect,
  onClose,
  anchorRef,
  currentValue,
}: {
  onSelect: (v: number) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  currentValue: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const pop = ref.current;
    if (!anchor || !pop) return;
    const updatePos = () => {
      const rect = anchor.getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();
      const popH = popRect.height;
      const popW = popRect.width;
      let top = rect.bottom + 4;
      let left = rect.left;
      if (top + popH > window.innerHeight) {
        top = rect.top - popH - 4;
      }
      if (left + popW > window.innerWidth) {
        left = window.innerWidth - popW - 8;
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

  return createPortal(
    <div
      ref={ref}
      onMouseDown={(e) => e.preventDefault()}
      style={{ position: "fixed", top: pos.top, left: pos.left, visibility: visible ? "visible" : "hidden" }}
      className="z-[9999] bg-white rounded-lg shadow-lg border border-gray-200 p-2 select-none"
    >
      <div className="space-y-1">
        {PRESET_GROUPS.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="border-t border-gray-100 my-1" />}
            <div className="grid grid-cols-3 gap-1">
              {group.values.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onSelect(v)}
                  className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                    v === currentValue
                      ? "bg-blue-600 text-white font-semibold"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {formatDuration(v)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/*  DurationInput                                                     */
/* ------------------------------------------------------------------ */

interface DurationInputProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

export function DurationInput({
  value,
  onChange,
  className = "",
  disabled = false,
  required,
}: DurationInputProps) {
  const [popOpen, setPopOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const numValue = parseFloat(value) || 1;

  const step = useCallback(
    (direction: 1 | -1, size: number) => {
      const next = Math.round((numValue + direction * size) * 100) / 100;
      if (next < MIN_VALUE) return;
      onChange(String(next));
    },
    [numValue, onChange]
  );

  const handleSelect = useCallback(
    (v: number) => {
      onChange(String(v));
      setPopOpen(false);
    },
    [onChange]
  );

  const closePopover = useCallback(() => setPopOpen(false), []);

  return (
    <div ref={wrapperRef} className={`relative flex items-center ${className}`}>
      {/* Hidden input za form validation */}
      {required && (
        <input
          type="number"
          value={value}
          required
          tabIndex={-1}
          className="absolute opacity-0 w-0 h-0 pointer-events-none"
          readOnly
        />
      )}

      {/* −1h gumb */}
      <button
        type="button"
        onClick={() => step(-1, STEP_HOUR)}
        disabled={disabled || numValue <= STEP_HOUR}
        className="flex-shrink-0 w-6 h-full flex items-center justify-center text-gray-300 hover:text-gray-500 disabled:opacity-30 transition-colors"
        tabIndex={-1}
        title="−1h"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <polyline points="6,2 3,5 6,8" />
          <polyline points="9,2 6,5 9,8" />
        </svg>
      </button>

      {/* −15min gumb */}
      <button
        type="button"
        onClick={() => step(-1, STEP_FINE)}
        disabled={disabled || numValue <= MIN_VALUE}
        className="flex-shrink-0 w-5 h-full flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
        tabIndex={-1}
        title="−15m"
      >
        <svg width="8" height="10" viewBox="0 0 8 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <polyline points="6,2 3,5 6,8" />
        </svg>
      </button>

      {/* Display */}
      <span
        className={`flex-1 text-center truncate ${disabled ? "text-gray-400" : "cursor-default"}`}
      >
        {formatDuration(numValue)}
      </span>

      {/* +15min gumb */}
      <button
        type="button"
        onClick={() => step(1, STEP_FINE)}
        disabled={disabled}
        className="flex-shrink-0 w-5 h-full flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
        tabIndex={-1}
        title="+15m"
      >
        <svg width="8" height="10" viewBox="0 0 8 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <polyline points="2,2 5,5 2,8" />
        </svg>
      </button>

      {/* +1h gumb */}
      <button
        type="button"
        onClick={() => step(1, STEP_HOUR)}
        disabled={disabled}
        className="flex-shrink-0 w-6 h-full flex items-center justify-center text-gray-300 hover:text-gray-500 disabled:opacity-30 transition-colors"
        tabIndex={-1}
        title="+1h"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <polyline points="1,2 4,5 1,8" />
          <polyline points="4,2 7,5 4,8" />
        </svg>
      </button>

      {/* Dropdown trigger */}
      {!disabled && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setPopOpen((o) => !o);
          }}
          className="flex-shrink-0 w-6 h-full flex items-center justify-center text-gray-400 hover:text-gray-600 border-l border-gray-200 transition-colors"
          tabIndex={-1}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M2 3.5L5 7L8 3.5H2Z" />
          </svg>
        </button>
      )}

      {popOpen && !disabled && (
        <DurationPopover
          onSelect={handleSelect}
          onClose={closePopover}
          anchorRef={wrapperRef}
          currentValue={numValue}
        />
      )}
    </div>
  );
}
