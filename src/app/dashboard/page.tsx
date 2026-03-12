"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { startOfDay } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useMachines } from "@/hooks/use-machines";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { computeSchedule } from "@/lib/scheduler";
import { WorkOrdersView, ColumnToggle, TOGGLEABLE_COLUMNS, DEFAULT_COLUMN_VISIBILITY } from "@/components/work-orders-table";
import type { VisibilityState } from "@tanstack/react-table";
import { Timeline } from "@/components/timeline";
import { MachineDialog } from "@/components/machine-dialog";
import { NewOrderSheet } from "@/components/new-order-dialog";
import { StatusBar } from "@/components/status-bar";
import { SchedulingInfoModal } from "@/components/scheduling-info-modal";

type Tab = "nalozi" | "gant";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const {
    machines,
    loading: machinesLoading,
    addMachine,
    updateMachine,
    deleteMachine,
  } = useMachines();
  const {
    orders,
    loading: ordersLoading,
    addOrder,
    updateOrder,
    deleteOrder,
  } = useWorkOrders();

  const [activeTab, setActiveTab] = useState<Tab>("nalozi");
  const [showMachineDialog, setShowMachineDialog] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [filterMachine, setFilterMachine] = useState("");
  const [filterIzvedba, setFilterIzvedba] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [hoveredOrderId, setHoveredOrderId] = useState<string | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_COLUMN_VISIBILITY);

  const ganttStartDate = useMemo(() => startOfDay(new Date()), []);

  const scheduleResult = useMemo(() => {
    if (machines.length === 0)
      return { scheduled: [], byMachine: new Map<string, never[]>() };
    return computeSchedule(orders, machines, ganttStartDate);
  }, [orders, machines, ganttStartDate]);

  // Filtrirani nalozi
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (filterMachine)
      result = result.filter((o) => o.machine_id === filterMachine);
    if (filterIzvedba)
      result = result.filter((o) => o.izvedba === filterIzvedba);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((o) => {
        const machineName =
          machines.find((m) => m.id === o.machine_id)?.name ?? "";
        return (
          o.rn_id.toLowerCase().includes(q) ||
          (o.opis ?? "").toLowerCase().includes(q) ||
          (o.napomena ?? "").toLowerCase().includes(q) ||
          machineName.toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [orders, machines, filterMachine, filterIzvedba, searchQuery]);

  // Filtrirani scheduled
  const filteredScheduled = useMemo(() => {
    let result = scheduleResult.scheduled;
    if (filterMachine)
      result = result.filter((s) => s.order.machine_id === filterMachine);
    if (filterIzvedba)
      result = result.filter((s) => s.order.izvedba === filterIzvedba);
    return result;
  }, [scheduleResult.scheduled, filterMachine, filterIzvedba]);

  // Quick stats
  const overlapCount = scheduleResult.scheduled.filter(
    (s) => s.status === "PREKLAPANJE"
  ).length;
  const lateCount = scheduleResult.scheduled.filter(
    (s) => s.stanje === "KASNI"
  ).length;
  const criticalCount = scheduleResult.scheduled.filter(
    (s) => s.stanje === "KRITIČNO"
  ).length;
  const activeCount = orders.filter((o) => o.izvedba !== "ZAVRŠEN").length;

  const handleMoveOrder = async (orderId: string, targetDate: string) => {
    await updateOrder(orderId, { najraniji_pocetak: targetDate });
  };

  const handleUnpinOrder = async (orderId: string) => {
    await updateOrder(orderId, { najraniji_pocetak: null });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const hasActiveFilters = !!(filterMachine || filterIzvedba);

  if (machinesLoading || ordersLoading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-[1.5px] border-gray-900 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-gray-400">
            Učitavam...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-white">
      {/* ======== HEADER ======== */}
      <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gray-900 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1L2 5v6l6 4 6-4V5L8 1z"
                stroke="white"
                strokeWidth="1.5"
                fill="none"
              />
              <circle cx="8" cy="8" r="2" fill="white" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900 tracking-tight leading-tight">
              Plan Proizvodnje
            </h1>
            <p className="text-[10px] text-gray-400 leading-tight">
              Waterjet Cutting
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Info button */}
          <button
            onClick={() => setShowInfo(true)}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-md hover:bg-gray-100 transition-colors"
            title="Upute"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
          {/* Alert badges */}
          {overlapCount > 0 && (
            <span className="hidden sm:inline-flex text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium border border-red-100">
              {overlapCount} prekl.
            </span>
          )}
          {lateCount > 0 && (
            <span className="hidden sm:inline-flex text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-medium border border-amber-100">
              {lateCount} kasni
            </span>
          )}
          {criticalCount > 0 && (
            <span className="hidden sm:inline-flex text-[10px] bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full font-medium border border-yellow-200">
              {criticalCount} kritično
            </span>
          )}
          {/* Desktop: Novi nalog button */}
          <button
            onClick={() => setShowNewOrder(true)}
            className="hidden lg:inline-flex items-center gap-1.5 text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Novi nalog
          </button>
          {/* Machines button */}
          <button
            onClick={() => setShowMachineDialog(true)}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-md hover:bg-gray-100 transition-colors"
            title="Strojevi"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </button>
          {/* Logout */}
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-gray-600 text-[11px] transition-colors"
          >
            Odjava
          </button>
        </div>
      </header>

      {/* ======== MOBILE: Tab bar ======== */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-2 flex-shrink-0">
        <div className="relative flex bg-gray-100 rounded-md p-0.5 max-w-[240px]">
          <div
            className="absolute top-0.5 bottom-0.5 bg-white rounded shadow-sm transition-transform duration-200 ease-out"
            style={{
              width: "50%",
              transform:
                activeTab === "nalozi"
                  ? "translateX(0)"
                  : "translateX(100%)",
            }}
          />
          <button
            onClick={() => setActiveTab("nalozi")}
            className={`relative z-10 flex-1 text-xs font-medium py-1.5 rounded text-center transition-colors ${
              activeTab === "nalozi" ? "text-gray-900" : "text-gray-400"
            }`}
          >
            Nalozi
            <span className="ml-1 text-[10px] tabular-nums opacity-50">
              {activeCount}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("gant")}
            className={`relative z-10 flex-1 text-xs font-medium py-1.5 rounded text-center transition-colors ${
              activeTab === "gant" ? "text-gray-900" : "text-gray-400"
            }`}
          >
            Gant
          </button>
        </div>
      </div>

      {/* ======== DESKTOP CONTENT ======== */}
      <div className="hidden lg:flex lg:flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-col flex-1 min-h-0">
          {/* Search + Filters + Column Toggle */}
          <div className="px-3 py-2 flex items-center gap-2 flex-shrink-0 bg-white border-b border-gray-100">
            <div className="relative w-[200px] flex-shrink-0">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pretraži naloge..."
                className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-2 pl-8 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-300 bg-white placeholder:text-gray-300 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-md border transition-colors ${
                showFilters || hasActiveFilters
                  ? "bg-gray-900 border-gray-900 text-white"
                  : "border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>
            <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">
              {filteredOrders.length} naloga
            </span>
            <div className="flex-1" />
            <ColumnToggle
              columns={TOGGLEABLE_COLUMNS.map((col) => ({
                id: col.id,
                header: col.header,
                isVisible: columnVisibility[col.id] !== false,
                toggle: () =>
                  setColumnVisibility((prev) => ({
                    ...prev,
                    [col.id]: prev[col.id] === false ? true : false,
                  })),
              }))}
            />
          </div>
          {showFilters && (
            <div className="px-3 py-2 flex flex-wrap gap-2 bg-gray-50 border-b border-gray-100 flex-shrink-0">
              <select value={filterMachine} onChange={(e) => setFilterMachine(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/5">
                <option value="">Svi strojevi</option>
                {machines.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
              </select>
              <select value={filterIzvedba} onChange={(e) => setFilterIzvedba(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/5">
                <option value="">Sve izvedbe</option>
                <option value="PLANIRAN">PLANIRAN</option>
                <option value="U TIJEKU">U TIJEKU</option>
                <option value="ZAVRŠEN">ZAVRŠEN</option>
              </select>
              {hasActiveFilters && (
                <button onClick={() => { setFilterMachine(""); setFilterIzvedba(""); }} className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 transition-colors">
                  Očisti
                </button>
              )}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-auto">
            <WorkOrdersView
              orders={filteredOrders}
              machines={machines}
              scheduled={filteredScheduled}
              onUpdate={updateOrder}
              onDelete={deleteOrder}
              hoveredOrderId={hoveredOrderId}
              onHoverOrder={setHoveredOrderId}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
            />
          </div>
        </div>
        <div className="border-t border-gray-200 flex-shrink-0">
          <Timeline
            machines={machines}
            scheduled={scheduleResult.scheduled}
            ganttStartDate={ganttStartDate}
            hoveredOrderId={hoveredOrderId}
            onHoverOrder={setHoveredOrderId}
            onMoveOrder={handleMoveOrder}
            onUnpinOrder={handleUnpinOrder}
          />
        </div>
      </div>

      {/* Mobile: tabbed view */}
      <div className="lg:hidden flex-1 min-h-0 overflow-hidden">
        {activeTab === "nalozi" ? (
          <div className="h-full flex flex-col">
            <div className="px-3 py-2 flex items-center gap-2 flex-shrink-0 bg-white border-b border-gray-100">
              <div className="relative flex-1">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pretraži naloge..."
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-2 pl-8 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-300 bg-white placeholder:text-gray-300"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 rounded-md border transition-colors ${
                  showFilters || hasActiveFilters
                    ? "bg-gray-900 border-gray-900 text-white"
                    : "border-gray-200 text-gray-400 hover:text-gray-600"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
              </button>
              <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0 hidden sm:inline">
                {filteredOrders.length} naloga
              </span>
            </div>

            {showFilters && (
              <div className="px-3 py-2 flex flex-wrap gap-2 bg-gray-50 border-b border-gray-100 flex-shrink-0">
                <select value={filterMachine} onChange={(e) => setFilterMachine(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/5">
                  <option value="">Svi strojevi</option>
                  {machines.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                </select>
                <select value={filterIzvedba} onChange={(e) => setFilterIzvedba(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/5">
                  <option value="">Sve izvedbe</option>
                  <option value="PLANIRAN">PLANIRAN</option>
                  <option value="U TIJEKU">U TIJEKU</option>
                  <option value="ZAVRŠEN">ZAVRŠEN</option>
                </select>
                {hasActiveFilters && (
                  <button onClick={() => { setFilterMachine(""); setFilterIzvedba(""); }} className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 transition-colors">
                    Očisti
                  </button>
                )}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-hidden">
              <WorkOrdersView
                orders={filteredOrders}
                machines={machines}
                scheduled={filteredScheduled}
                onUpdate={updateOrder}
                onDelete={deleteOrder}
              />
            </div>
          </div>
        ) : (
          <div className="h-full">
            <Timeline
              machines={machines}
              scheduled={scheduleResult.scheduled}
              ganttStartDate={ganttStartDate}
              onMoveOrder={handleMoveOrder}
              onUnpinOrder={handleUnpinOrder}
            />
          </div>
        )}
      </div>

      {/* ======== STATUS BAR ======== */}
      <StatusBar scheduled={scheduleResult.scheduled} machines={machines} />

      {/* ======== FAB — Add Order (mobile only) ======== */}
      <button
        onClick={() => setShowNewOrder(true)}
        className="lg:hidden fixed z-40 w-12 h-12 bg-gray-900 text-white rounded-full shadow-lg shadow-gray-900/20 flex items-center justify-center hover:bg-gray-800 active:scale-95 transition-all"
        style={{
          right: 16,
          bottom: `calc(3rem + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* ======== BOTTOM SHEET: New Order ======== */}
      <NewOrderSheet
        open={showNewOrder}
        onClose={() => setShowNewOrder(false)}
        machines={machines}
        onAdd={addOrder}
      />

      {/* ======== Machine Dialog ======== */}
      <MachineDialog
        open={showMachineDialog}
        onClose={() => setShowMachineDialog(false)}
        machines={machines}
        onAdd={addMachine}
        onUpdate={updateMachine}
        onDelete={deleteMachine}
      />

      {/* ======== Info Modal ======== */}
      <SchedulingInfoModal open={showInfo} onClose={() => setShowInfo(false)} />
    </div>
  );
}
