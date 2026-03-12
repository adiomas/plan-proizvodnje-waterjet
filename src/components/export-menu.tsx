"use client";

import { useState, useRef, useEffect } from "react";
import { startOfDay } from "date-fns";
import type { Machine, MachineOverride, ScheduledOrder } from "@/lib/types";
import {
  downloadDailyPDF,
  downloadWeeklyPDF,
  getMonday,
} from "@/lib/pdf/generate";

interface Props {
  machines: Machine[];
  scheduled: ScheduledOrder[];
  overrides?: MachineOverride[];
}

type ReportType = "daily" | "weekly";

export function ExportMenu({ machines, scheduled, overrides = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ReportType>("daily");
  const [machineId, setMachineId] = useState<string>("all");
  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleExport = async () => {
    setLoading(true);
    try {
      const machine =
        machineId === "all"
          ? null
          : machines.find((m) => m.id === machineId) ?? null;
      const targetDate = startOfDay(new Date(date + "T00:00:00"));

      if (type === "daily") {
        await downloadDailyPDF(machine, machines, scheduled, targetDate, overrides);
      } else {
        const monday = getMonday(targetDate);
        await downloadWeeklyPDF(machine, machines, scheduled, monday, overrides);
      }
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md hover:bg-gray-100 border border-gray-200 transition-colors"
        title="Export PDF"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
          <path d="M12 3v12" />
          <path d="M5 21h14" />
        </svg>
        <span className="hidden sm:inline">Export</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50 p-3">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
            Export PDF
          </div>

          {/* Report type */}
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setType("daily")}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                type === "daily"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              Dnevni
            </button>
            <button
              onClick={() => setType("weekly")}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                type === "weekly"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              Tjedni
            </button>
          </div>

          {/* Machine select */}
          <label className="block mb-2">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
              Stroj
            </span>
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              className="mt-0.5 w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/5"
            >
              <option value="all">Svi strojevi</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          {/* Date picker */}
          <label className="block mb-3">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
              {type === "daily" ? "Datum" : "Tjedan koji sadrži datum"}
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-0.5 w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/5"
            />
          </label>

          {/* Download button */}
          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full text-xs font-medium bg-gray-900 text-white py-2 rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
          >
            {loading ? (
              <>
                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                Generiram...
              </>
            ) : (
              <>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Preuzmi PDF
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
