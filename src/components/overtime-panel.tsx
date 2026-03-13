"use client";

import { useState, useEffect, useRef } from "react";
import type { OvertimeSuggestion, OvertimeSuggestionResult } from "@/lib/types";
import { formatDayDate } from "@/lib/utils";

interface ApprovedEntry {
  suggestion: OvertimeSuggestion;
  overrideId: string;
}

interface OvertimePanelProps {
  result: OvertimeSuggestionResult;
  open: boolean;
  onClose: () => void;
  onApprove: (suggestion: OvertimeSuggestion) => Promise<string | null>;
  onApproveAll: (suggestions: OvertimeSuggestion[]) => Promise<(string | null)[]>;
  onUndoApprove: (overrideId: string) => Promise<void>;
}

export function OvertimePanel({ result, open, onClose, onApprove, onApproveAll, onUndoApprove }: OvertimePanelProps) {
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [approvingAll, setApprovingAll] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [approvedMap, setApprovedMap] = useState<Map<string, ApprovedEntry>>(new Map());
  const [undoing, setUndoing] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  const { suggestions, total_late, total_critical, fixable_count, total_overtime_hours } = result;

  // Click outside zatvara
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const visibleSuggestions = suggestions.filter(
    (s) => !dismissed.has(`${s.machine_id}-${s.date}`)
  );

  const approvedEntries = Array.from(approvedMap.values());

  const handleApprove = async (suggestion: OvertimeSuggestion) => {
    const key = `${suggestion.machine_id}-${suggestion.date}`;
    setApproving((prev) => new Set(prev).add(key));
    try {
      const overrideId = await onApprove(suggestion);
      if (overrideId) {
        setApprovedMap((prev) => new Map(prev).set(key, { suggestion, overrideId }));
      }
    } finally {
      setApproving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleApproveAll = async () => {
    setApprovingAll(true);
    try {
      const ids = await onApproveAll(visibleSuggestions);
      const newApproved = new Map(approvedMap);
      visibleSuggestions.forEach((s, i) => {
        const id = ids[i];
        if (id) {
          const key = `${s.machine_id}-${s.date}`;
          newApproved.set(key, { suggestion: s, overrideId: id });
        }
      });
      setApprovedMap(newApproved);
    } finally {
      setApprovingAll(false);
    }
  };

  const handleUndo = async (key: string, overrideId: string) => {
    setUndoing((prev) => new Set(prev).add(key));
    try {
      await onUndoApprove(overrideId);
      setApprovedMap((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } finally {
      setUndoing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleDismiss = (suggestion: OvertimeSuggestion) => {
    setDismissed((prev) => new Set(prev).add(`${suggestion.machine_id}-${suggestion.date}`));
  };

  const shiftLabel = (s: OvertimeSuggestion) =>
    s.shift_type === "weekday_evening"
      ? `${s.work_start}–${s.work_end} (večernja)`
      : `${s.work_start}–${s.work_end} (vikend)`;

  return (
    <>
      {/* Backdrop — samo mobitel */}
      <div className="sm:hidden fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div
        ref={panelRef}
        className="fixed inset-x-0 bottom-0 z-50 w-full rounded-t-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-1 sm:bottom-auto sm:w-[380px] sm:rounded-lg bg-white border border-gray-200 shadow-xl max-h-[75dvh] sm:max-h-none"
      >
        {/* Drag handle — samo mobitel */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-8 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 text-sm">💡</span>
            <span className="text-xs font-semibold text-gray-800">
              Prijedlog prekovremenog
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          {fixable_count} od {total_late + total_critical} kasnih naloga može stići na vrijeme
          {total_overtime_hours > 0 && (
            <span className="ml-1 text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
              {total_overtime_hours}h ukupno
            </span>
          )}
        </p>
      </div>

      {/* Body */}
      <div className="overflow-y-auto p-3 space-y-2 sm:max-h-[400px]">
        {/* Odobreni prijedlozi */}
        {approvedEntries.map(({ suggestion: s, overrideId }) => {
          const key = `${s.machine_id}-${s.date}`;
          const isUndoing = undoing.has(key);
          const date = new Date(s.date + "T00:00:00");

          return (
            <div
              key={`approved-${key}`}
              className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-600">✓</span>
                    <span className="font-medium text-emerald-800">
                      {s.machine_name} — {formatDayDate(date)}
                    </span>
                  </div>
                  <div className="text-emerald-600 mt-0.5 ml-5">
                    {shiftLabel(s)} · Odobreno
                  </div>
                </div>
                <button
                  onClick={() => handleUndo(key, overrideId)}
                  disabled={isUndoing}
                  className="text-[11px] font-medium text-emerald-700 hover:text-red-600 px-2 py-1 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {isUndoing ? "..." : "Poništi"}
                </button>
              </div>
            </div>
          );
        })}

        {/* Pending prijedlozi */}
        {visibleSuggestions.length === 0 && approvedEntries.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Svi prijedlozi odbačeni</p>
        ) : (
          visibleSuggestions.map((s) => {
            const key = `${s.machine_id}-${s.date}`;
            const isApproving = approving.has(key);
            const date = new Date(s.date + "T00:00:00");

            return (
              <div
                key={key}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800">
                      {s.machine_name} — {formatDayDate(date)}
                    </div>
                    <div className="text-gray-500 mt-0.5">
                      {shiftLabel(s)} · {s.hours_gained}h
                    </div>
                    <div className="text-amber-700 mt-0.5 font-medium">
                      {s.orders_fixed.join(", ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleApprove(s)}
                      disabled={isApproving || approvingAll}
                      className="text-[11px] font-medium bg-emerald-500 text-white px-2.5 py-1 rounded-md hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                    >
                      {isApproving ? "..." : "Odobri"}
                    </button>
                    <button
                      onClick={() => handleDismiss(s)}
                      className="text-[11px] text-gray-400 hover:text-gray-600 px-1.5 py-1 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer — Odobri sve */}
      {visibleSuggestions.length > 1 && (
        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={handleApproveAll}
            disabled={approvingAll}
            className="w-full text-[11px] font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {approvingAll ? "Odobravam..." : `Odobri sve (${visibleSuggestions.length})`}
          </button>
        </div>
      )}
      </div>
    </>
  );
}
