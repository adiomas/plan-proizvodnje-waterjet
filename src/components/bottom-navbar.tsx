"use client";

import { useState } from "react";
import { startOfDay } from "date-fns";
import type { UserRole, Machine, ScheduledOrder, MachineOverride } from "@/lib/types";
import { DateInput, parseDateInput } from "@/components/ui/date-input";
import {
  downloadDailyPDF,
  downloadWeeklyPDF,
  getMonday,
} from "@/lib/pdf/generate";
import { useIsStandalone } from "@/hooks/use-pwa-refresh";

interface BottomNavbarProps {
  activeTab: "nalozi" | "gant";
  onTabChange: (tab: "nalozi" | "gant") => void;
  onAddClick: () => void;
  canAdd: boolean;
  role: UserRole;
  activeOrderCount: number;
  // Alert counts
  overlapCount: number;
  lateCount: number;
  criticalCount: number;
  expiredCount: number;
  hitniRokCount: number;
  // Alati props
  sirovineEnabled: boolean;
  onToggleSirovine: () => void;
  overtimeFixableCount: number;
  onShowOvertime: () => void;
  overridesCount: number;
  onShowOverrides: () => void;
  onShowMachines: () => void;
  machines: Machine[];
  scheduled: ScheduledOrder[];
  overrides: MachineOverride[];
  // Više props
  onShowInfo: () => void;
  onLogout: () => void;
}

type ExportType = "daily" | "weekly";

export function BottomNavbar({
  activeTab,
  onTabChange,
  onAddClick,
  canAdd,
  role,
  activeOrderCount,
  overlapCount,
  lateCount,
  criticalCount,
  expiredCount,
  hitniRokCount,
  sirovineEnabled,
  onToggleSirovine,
  overtimeFixableCount,
  onShowOvertime,
  overridesCount,
  onShowOverrides,
  onShowMachines,
  machines,
  scheduled,
  overrides,
  onShowInfo,
  onLogout,
}: BottomNavbarProps) {
  const [showAlati, setShowAlati] = useState(false);
  const [showVise, setShowVise] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Export form state
  const [exportType, setExportType] = useState<ExportType>("daily");
  const [exportMachineId, setExportMachineId] = useState("all");
  const [exportDate, setExportDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [exportDateDisplay, setExportDateDisplay] = useState(() => {
    const today = new Date();
    const iso = today.toISOString().split("T")[0];
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  });
  const [exportLoading, setExportLoading] = useState(false);

  const isStandalone = useIsStandalone();
  const alertCount = overlapCount + lateCount + criticalCount + expiredCount + hitniRokCount;
  const isAdmin = role === "admin";

  const closeAll = () => {
    setShowAlati(false);
    setShowVise(false);
    setShowExport(false);
  };

  const handleTabPress = (tab: "nalozi" | "gant") => {
    closeAll();
    onTabChange(tab);
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const machine =
        exportMachineId === "all"
          ? null
          : machines.find((m) => m.id === exportMachineId) ?? null;
      const targetDate = startOfDay(new Date(exportDate + "T00:00:00"));

      if (exportType === "daily") {
        await downloadDailyPDF(machine, machines, scheduled, targetDate, overrides, sirovineEnabled);
      } else {
        const monday = getMonday(targetDate);
        await downloadWeeklyPDF(machine, machines, scheduled, monday, overrides, sirovineEnabled);
      }
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExportLoading(false);
      setShowExport(false);
    }
  };

  const anySheetOpen = showAlati || showVise || showExport;

  // Sheet bottom position — above the navbar
  const sheetBottom = "calc(3.5rem + env(safe-area-inset-bottom, 0px))";

  return (
    <>
      {/* ====== BACKDROP ====== */}
      {anySheetOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 animate-backdrop"
          onClick={closeAll}
        />
      )}

      {/* ====== ALATI SHEET ====== */}
      {showAlati && isAdmin && (
        <div
          className="lg:hidden fixed inset-x-0 z-[45] bg-white rounded-t-2xl shadow-2xl animate-sheet-up"
          style={{ bottom: sheetBottom }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-8 h-1 rounded-full bg-gray-300" />
          </div>

          <div className="px-5 pb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Alati</h3>
            <button
              onClick={() => setShowAlati(false)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Alert summary */}
          {alertCount > 0 && (
            <div className="mx-5 mb-3 flex flex-wrap gap-1.5">
              {overlapCount > 0 && (
                <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium border border-red-100">
                  {overlapCount} preklapanje
                </span>
              )}
              {lateCount > 0 && (
                <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-medium border border-amber-100">
                  {lateCount} kasni
                </span>
              )}
              {criticalCount > 0 && (
                <span className="text-[10px] bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full font-medium border border-yellow-200">
                  {criticalCount} kritično
                </span>
              )}
              {expiredCount > 0 && (
                <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold border border-red-300">
                  {expiredCount} istekao
                </span>
              )}
              {hitniRokCount > 0 && (
                <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium border border-red-100">
                  {hitniRokCount} hitni rok
                </span>
              )}
            </div>
          )}

          {/* Action rows */}
          <div className="border-t border-gray-100">
            {/* Sirovine toggle */}
            <button
              onClick={onToggleSirovine}
              className="w-full flex items-center justify-between px-5 py-3.5 active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <span className="text-sm text-gray-900">Sirovine</span>
              </div>
              <div className={`w-10 h-6 rounded-full relative transition-colors ${sirovineEnabled ? "bg-emerald-500" : "bg-gray-300"}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${sirovineEnabled ? "translate-x-5" : "translate-x-1"}`} />
              </div>
            </button>

            {/* Overtime */}
            {overtimeFixableCount > 0 && (
              <button
                onClick={() => { setShowAlati(false); onShowOvertime(); }}
                className="w-full flex items-center justify-between px-5 py-3.5 active:bg-gray-50 transition-colors border-t border-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-sm">
                    💡
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-900">Prekovremeni</span>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                      {overtimeFixableCount}
                    </span>
                  </div>
                </div>
                <ChevronRight />
              </button>
            )}

            {/* Overrides */}
            <button
              onClick={() => { setShowAlati(false); onShowOverrides(); }}
              className="w-full flex items-center justify-between px-5 py-3.5 active:bg-gray-50 transition-colors border-t border-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center text-sm">
                  ⏰
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-900">Radno vrijeme</span>
                  {overridesCount > 0 && (
                    <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">
                      {overridesCount}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight />
            </button>

            {/* Export */}
            <button
              onClick={() => { setShowAlati(false); setShowExport(true); }}
              className="w-full flex items-center justify-between px-5 py-3.5 active:bg-gray-50 transition-colors border-t border-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                    <path d="M12 3v12" />
                    <path d="M5 21h14" />
                  </svg>
                </div>
                <span className="text-sm text-gray-900">Export PDF</span>
              </div>
              <ChevronRight />
            </button>

            {/* Machines */}
            <button
              onClick={() => { setShowAlati(false); onShowMachines(); }}
              className="w-full flex items-center justify-between px-5 py-3.5 active:bg-gray-50 transition-colors border-t border-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                </div>
                <span className="text-sm text-gray-900">Strojevi</span>
              </div>
              <ChevronRight />
            </button>
          </div>
        </div>
      )}

      {/* ====== VIŠE SHEET ====== */}
      {showVise && (
        <div
          className="lg:hidden fixed inset-x-0 z-[45] bg-white rounded-t-2xl shadow-2xl animate-sheet-up"
          style={{ bottom: sheetBottom }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-8 h-1 rounded-full bg-gray-300" />
          </div>

          <div className="px-5 pb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Više</h3>
            <button
              onClick={() => setShowVise(false)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="border-t border-gray-100">
            {/* Upute */}
            <button
              onClick={() => { setShowVise(false); onShowInfo(); }}
              className="w-full flex items-center justify-between px-5 py-3.5 active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </div>
                <span className="text-sm text-gray-900">Upute</span>
              </div>
              <ChevronRight />
            </button>

            {/* PWA Refresh */}
            {isStandalone && (
              <button
                onClick={() => { setShowVise(false); window.location.reload(); }}
                className="w-full flex items-center justify-between px-5 py-3.5 active:bg-gray-50 transition-colors border-t border-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </div>
                  <span className="text-sm text-gray-900">Osvježi aplikaciju</span>
                </div>
                <ChevronRight />
              </button>
            )}

            {/* Odjava */}
            <button
              onClick={() => { setShowVise(false); onLogout(); }}
              className="w-full flex items-center justify-between px-5 py-3.5 active:bg-gray-50 transition-colors border-t border-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </div>
                <span className="text-sm text-red-600">Odjava</span>
              </div>
            </button>
          </div>

          {/* App info */}
          <div className="px-5 py-3 border-t border-gray-100">
            <p className="text-[10px] text-gray-300 text-center">Plan Proizvodnje · Waterjet Cutting</p>
          </div>
        </div>
      )}

      {/* ====== EXPORT SHEET ====== */}
      {showExport && (
        <div
          className="lg:hidden fixed inset-x-0 z-[45] bg-white rounded-t-2xl shadow-2xl animate-sheet-up"
          style={{ bottom: sheetBottom }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-8 h-1 rounded-full bg-gray-300" />
          </div>

          <div className="px-5 pb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Export PDF</h3>
            <button
              onClick={() => setShowExport(false)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="px-5 pb-5 space-y-3">
            {/* Report type toggle */}
            <div className="flex gap-1">
              <button
                onClick={() => setExportType("daily")}
                className={`flex-1 text-xs py-2 rounded-md font-medium transition-colors ${
                  exportType === "daily"
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                Dnevni
              </button>
              <button
                onClick={() => setExportType("weekly")}
                className={`flex-1 text-xs py-2 rounded-md font-medium transition-colors ${
                  exportType === "weekly"
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                Tjedni
              </button>
            </div>

            {/* Machine select */}
            <label className="block">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                Stroj
              </span>
              <select
                value={exportMachineId}
                onChange={(e) => setExportMachineId(e.target.value)}
                className="mt-0.5 w-full text-xs border border-gray-200 rounded-md px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/5"
              >
                <option value="all">Svi strojevi</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>

            {/* Date input */}
            <label className="block">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                {exportType === "daily" ? "Datum" : "Tjedan koji sadrži datum"}
              </span>
              <DateInput
                value={exportDate}
                displayValue={exportDateDisplay}
                onChange={(iso, disp) => { setExportDate(iso); setExportDateDisplay(disp); }}
                onDisplayChange={(v) => { setExportDateDisplay(v); const iso = parseDateInput(v); if (iso) setExportDate(iso); }}
                className="mt-0.5 w-full text-xs border border-gray-200 rounded-md px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/5"
              />
            </label>

            {/* Download button */}
            <button
              onClick={handleExport}
              disabled={exportLoading}
              className="w-full text-xs font-medium bg-gray-900 text-white py-2.5 rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              {exportLoading ? (
                <>
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  Generiram...
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Preuzmi PDF
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ====== BOTTOM NAVBAR ====== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200">
        <div className="flex items-center justify-around h-14 px-2">
          {/* Nalozi */}
          <button
            onClick={() => handleTabPress("nalozi")}
            className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] gap-0.5 transition-colors ${
              activeTab === "nalozi" && !anySheetOpen ? "text-gray-900" : "text-gray-400"
            }`}
          >
            <div className="relative">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
              {activeOrderCount > 0 && (
                <span className="absolute -top-1.5 -right-3 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-gray-900 text-white rounded-full px-1 tabular-nums">
                  {activeOrderCount > 99 ? "99+" : activeOrderCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium leading-none">Nalozi</span>
          </button>

          {/* Gant */}
          <button
            onClick={() => handleTabPress("gant")}
            className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] gap-0.5 transition-colors ${
              activeTab === "gant" && !anySheetOpen ? "text-gray-900" : "text-gray-400"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="4" rx="1" />
              <rect x="3" y="10" width="12" height="4" rx="1" />
              <rect x="3" y="16" width="15" height="4" rx="1" />
            </svg>
            <span className="text-[10px] font-medium leading-none">Gant</span>
          </button>

          {/* Center: + Novi */}
          {canAdd && (
            <button
              onClick={() => { closeAll(); onAddClick(); }}
              className="flex flex-col items-center justify-center -mt-3"
            >
              <div className="w-12 h-12 bg-gray-900 rounded-full shadow-lg shadow-gray-900/25 flex items-center justify-center active:scale-95 transition-transform">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span className="text-[10px] font-medium text-gray-900 mt-0.5 leading-none">Novi</span>
            </button>
          )}

          {/* Alati — admin only */}
          {isAdmin && (
            <button
              onClick={() => { setShowVise(false); setShowExport(false); setShowAlati(!showAlati); }}
              className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] gap-0.5 transition-colors ${
                showAlati ? "text-gray-900" : "text-gray-400"
              }`}
            >
              <div className="relative">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                {alertCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white" />
                )}
              </div>
              <span className="text-[10px] font-medium leading-none">Alati</span>
            </button>
          )}

          {/* Više */}
          <button
            onClick={() => { setShowAlati(false); setShowExport(false); setShowVise(!showVise); }}
            className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] gap-0.5 transition-colors ${
              showVise ? "text-gray-900" : "text-gray-400"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
            </svg>
            <span className="text-[10px] font-medium leading-none">Više</span>
          </button>
        </div>
        {/* Safe area bottom */}
        <div className="pb-safe bg-white" style={{ minHeight: 'env(safe-area-inset-bottom, 0px)' }} />
      </nav>
    </>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
