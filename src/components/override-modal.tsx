"use client";

import { useState, useCallback } from "react";
import type { Machine, MachineOverride } from "@/lib/types";
import { useSwipeDismiss } from "@/hooks/use-swipe-dismiss";
import { getDay } from "date-fns";
import { DateInput, parseDateInput } from "@/components/ui/date-input";

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
  const [date, setDate] = useState(""); // ISO yyyy-mm-dd
  const [dateDisplay, setDateDisplay] = useState(""); // dd.mm.yyyy
  const [workStart, setWorkStart] = useState("07:00");
  const [workEnd, setWorkEnd] = useState("15:00");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const dismissModal = useCallback(() => onClose(), [onClose]);
  const { sheetRef, handleRef: swipeHandleRef, backdropRef } = useSwipeDismiss({
    onDismiss: dismissModal,
    enabled: open,
  });

  if (!open) return null;

  const resetForm = () => {
    setMachineId("");
    setDate("");
    setDateDisplay("");
    setWorkStart("07:00");
    setWorkEnd("15:00");
    setError("");
  };

  /** Validiraj HH:MM 24h format */
  const isValidTime = (value: string): boolean => {
    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) return false;
    const h = Number(match[1]);
    const m = Number(match[2]);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  };

  const handleAdd = async () => {
    setError("");

    if (!machineId) { setError("Odaberi stroj"); return; }
    if (!date) { setError("Unesi datum (dd.mm.yyyy)"); return; }
    if (!isValidTime(workStart) || !isValidTime(workEnd)) { setError("Vrijeme mora biti u formatu HH:MM (24h)"); return; }
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
        <span className="text-[11px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full border border-purple-200">
          Radna subota
        </span>
      );
    }
    return (
      <span className="text-[11px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">
        Prekovremeni
      </span>
    );
  };

  const getMachineName = (id: string) => machines.find((m) => m.id === id)?.name ?? "—";
  const getMachineColor = (id: string) => machines.find((m) => m.id === id)?.color ?? "#999";

  const calcHours = (dateStr: string, start: string, end: string) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const overrideStart = sh + (sm || 0) / 60;
    const overrideEnd = eh + (em || 0) / 60;
    // Za radne dane: merge s default 07-15 (prekovremeni = produženje)
    const d = new Date(dateStr + "T00:00:00");
    const day = getDay(d);
    if (day !== 0 && day !== 6) {
      const mergedStart = Math.min(7, overrideStart);
      const mergedEnd = Math.max(15, overrideEnd);
      return mergedEnd - mergedStart;
    }
    return overrideEnd - overrideStart;
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
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-black/30" onClick={onClose}>
      <div ref={sheetRef} className="bg-white rounded-t-2xl lg:rounded-lg shadow-xl w-full lg:max-w-lg max-h-[85dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Mobile handle */}
        <div ref={swipeHandleRef} className="lg:hidden flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing swipe-handle">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Posebno radno vrijeme</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 -m-1 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Add form */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[120px]">
              <label className="text-[11px] text-gray-500 block mb-0.5">Stroj</label>
              <select
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="w-full text-sm lg:text-xs border border-gray-200 rounded-md px-3 py-2.5 lg:px-2 lg:py-1.5 bg-white"
              >
                <option value="">Odaberi...</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[130px]">
              <label className="text-[11px] text-gray-500 block mb-0.5">Datum</label>
              <DateInput
                value={date}
                displayValue={dateDisplay}
                onChange={(iso, disp) => { setDate(iso); setDateDisplay(disp); }}
                onDisplayChange={(v) => { setDateDisplay(v); const iso = parseDateInput(v); setDate(iso ?? ""); }}
                className="w-full text-sm lg:text-xs border border-gray-200 rounded-md px-3 py-2.5 lg:px-2 lg:py-1.5 bg-white"
              />
            </div>
            <div className="min-w-[70px]">
              <label className="text-[11px] text-gray-500 block mb-0.5">Od</label>
              <input
                type="text"
                placeholder="HH:MM"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                className="w-full text-sm lg:text-xs border border-gray-200 rounded-md px-3 py-2.5 lg:px-2 lg:py-1.5 bg-white"
              />
            </div>
            <div className="min-w-[70px]">
              <label className="text-[11px] text-gray-500 block mb-0.5">Do</label>
              <input
                type="text"
                placeholder="HH:MM"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                className="w-full text-sm lg:text-xs border border-gray-200 rounded-md px-3 py-2.5 lg:px-2 lg:py-1.5 bg-white"
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
            <p className="text-[11px] text-red-500 mt-1">{error}</p>
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
                    <td className="py-1.5">{calcHours(o.date, o.work_start, o.work_end)}h</td>
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
