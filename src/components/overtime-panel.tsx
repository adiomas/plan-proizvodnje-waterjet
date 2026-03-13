"use client";

import { useState } from "react";
import type { OvertimeSuggestion, OvertimeResult } from "@/lib/types";

interface OvertimePanelProps {
  result: OvertimeResult;
  open: boolean;
  onClose: () => void;
  onApprove: (s: OvertimeSuggestion) => Promise<string | null>;
  onApproveAll: (suggestions: OvertimeSuggestion[]) => Promise<(string | null)[]>;
  onUndoApprove: (overrideId: string) => Promise<void>;
}

export function OvertimePanel({
  result,
  open,
  onClose,
  onApprove,
  onApproveAll,
  onUndoApprove,
}: OvertimePanelProps) {
  const [approving, setApproving] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  // Praćenje odobrenih prijedloga: date+machine -> overrideId
  const [approved, setApproved] = useState<Map<string, string>>(new Map());

  if (!open) return null;

  const formatDate = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}.`;
  };

  const handleApprove = async (s: OvertimeSuggestion) => {
    const key = `${s.machine_id}:${s.date}`;
    setApproving(key);
    try {
      const id = await onApprove(s);
      if (id) {
        setApproved((prev) => new Map(prev).set(key, id));
      }
    } finally {
      setApproving(null);
    }
  };

  const handleUndo = async (s: OvertimeSuggestion) => {
    const key = `${s.machine_id}:${s.date}`;
    const overrideId = approved.get(key);
    if (!overrideId) return;
    setApproving(key);
    try {
      await onUndoApprove(overrideId);
      setApproved((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } finally {
      setApproving(null);
    }
  };

  const handleApproveAll = async () => {
    const pending = result.suggestions.filter(
      (s) => !approved.has(`${s.machine_id}:${s.date}`)
    );
    if (pending.length === 0) return;
    setApprovingAll(true);
    try {
      const ids = await onApproveAll(pending);
      setApproved((prev) => {
        const next = new Map(prev);
        pending.forEach((s, i) => {
          const id = ids[i];
          if (id) next.set(`${s.machine_id}:${s.date}`, id);
        });
        return next;
      });
    } finally {
      setApprovingAll(false);
    }
  };

  const pendingCount = result.suggestions.filter(
    (s) => !approved.has(`${s.machine_id}:${s.date}`)
  ).length;

  return (
    <div className="absolute top-full right-0 mt-1 z-50 w-80 bg-white border border-amber-200 rounded-lg shadow-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-amber-800">
          Prijedlozi prekovremenog ({result.fixable_count})
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-sm leading-none"
        >
          ✕
        </button>
      </div>

      {result.suggestions.length === 0 ? (
        <p className="text-xs text-gray-500 py-2">Nema prijedloga.</p>
      ) : (
        <>
          <div className="max-h-60 overflow-y-auto space-y-1.5">
            {result.suggestions.map((s) => {
              const key = `${s.machine_id}:${s.date}`;
              const isApproved = approved.has(key);
              const isLoading = approving === key;

              return (
                <div
                  key={key}
                  className={`text-xs p-2 rounded border ${
                    isApproved
                      ? "bg-green-50 border-green-200"
                      : "bg-amber-50 border-amber-100"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-800">
                        {s.machine_name}
                      </span>
                      <span className="text-gray-500 ml-1">
                        {formatDate(s.date)}
                      </span>
                    </div>
                    {isApproved ? (
                      <button
                        onClick={() => handleUndo(s)}
                        disabled={isLoading}
                        className="text-[10px] text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {isLoading ? "..." : "Poništi"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleApprove(s)}
                        disabled={isLoading}
                        className="text-[10px] text-amber-700 hover:text-amber-900 font-medium disabled:opacity-50"
                      >
                        {isLoading ? "..." : "Odobri"}
                      </button>
                    )}
                  </div>
                  <div className="text-gray-500 mt-0.5">
                    {s.work_start}–{s.work_end} (+{s.extra_hours}h) · {s.affected_orders} nalog(a)
                  </div>
                </div>
              );
            })}
          </div>

          {pendingCount > 1 && (
            <button
              onClick={handleApproveAll}
              disabled={approvingAll}
              className="mt-2 w-full text-xs py-1.5 bg-amber-100 text-amber-800 rounded hover:bg-amber-200 font-medium disabled:opacity-50 transition-colors"
            >
              {approvingAll ? "Odobravanje..." : `Odobri sve (${pendingCount})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
