"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { startOfDay } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useMachines } from "@/hooks/use-machines";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { computeSchedule } from "@/lib/scheduler";
import { WorkOrdersView, ColumnToggle, TOGGLEABLE_COLUMNS, DEFAULT_COLUMN_VISIBILITY } from "@/components/work-orders-table";
import type { VisibilityState } from "@tanstack/react-table";
import type { WorkOrder } from "@/lib/types";
import { Timeline } from "@/components/timeline";
import { MachineDialog } from "@/components/machine-dialog";
import { NewOrderSheet } from "@/components/new-order-dialog";
import { EditOrderDialog } from "@/components/edit-order-dialog";
import { StatusBar } from "@/components/status-bar";
import { SchedulingInfoModal } from "@/components/scheduling-info-modal";
import { ExportMenu } from "@/components/export-menu";
import { useOverrides } from "@/hooks/use-overrides";
import { useUserRole } from "@/hooks/use-user-role";
import { OverrideModal } from "@/components/override-modal";
import { useOvertimeSuggestions } from "@/hooks/use-overtime-suggestions";
import { OvertimePanel } from "@/components/overtime-panel";
import { PwaRefreshButton } from "@/components/pwa-refresh-button";
import { BottomNavbar } from "@/components/bottom-navbar";
import type { OvertimeSuggestion } from "@/lib/types";

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
    convertToSplit,
    convertToSingle,
  } = useWorkOrders();
  const {
    overrides,
    loading: overridesLoading,
    addOverride,
    deleteOverride,
  } = useOverrides();
  const {
    role,
    sirovineEnabled,
    loading: roleLoading,
    canEdit,
    canDelete,
    canAdd,
    canReorder,
    toggleSirovine,
  } = useUserRole();

  const [activeTab, setActiveTab] = useState<Tab>("nalozi");
  const [filterSirovine, setFilterSirovine] = useState("");
  const [showMachineDialog, setShowMachineDialog] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);
  const [filterMachine, setFilterMachine] = useState("");
  const [filterIzvedba, setFilterIzvedba] = useState("");
  const [filterHitniRok, setFilterHitniRok] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [hoveredOrderId, setHoveredOrderId] = useState<string | null>(null);
  const [hoveredSplitGroup, setHoveredSplitGroup] = useState<string | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_COLUMN_VISIBILITY);
  const [editingOrder, setEditingOrder] = useState<WorkOrder | null>(null);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const [showOvertimePopover, setShowOvertimePopover] = useState(false);

  const ganttStartDate = useMemo(() => startOfDay(new Date()), []);

  const scheduleResult = useMemo(() => {
    if (machines.length === 0)
      return { scheduled: [], byMachine: new Map<string, never[]>() };
    return computeSchedule(orders, machines, ganttStartDate, overrides, sirovineEnabled);
  }, [orders, machines, ganttStartDate, overrides, sirovineEnabled]);

  // Overtime suggestions
  const overtimeResult = useOvertimeSuggestions(
    scheduleResult.scheduled,
    orders,
    machines,
    overrides,
    ganttStartDate,
    sirovineEnabled
  );

  const handleApproveOvertime = useCallback(async (s: OvertimeSuggestion): Promise<string | null> => {
    const override = await addOverride(s.machine_id, s.date, s.work_start, s.work_end);
    return override?.id ?? null;
  }, [addOverride]);

  const handleApproveAllOvertime = useCallback(async (suggestions: OvertimeSuggestion[]): Promise<(string | null)[]> => {
    const ids: (string | null)[] = [];
    for (const s of suggestions) {
      const override = await addOverride(s.machine_id, s.date, s.work_start, s.work_end);
      ids.push(override?.id ?? null);
    }
    return ids;
  }, [addOverride]);

  const handleUndoApproveOvertime = useCallback(async (overrideId: string) => {
    await deleteOverride(overrideId);
  }, [deleteOverride]);

  // Filtrirani nalozi
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (filterMachine)
      result = result.filter((o) => o.machine_id === filterMachine);
    if (filterIzvedba)
      result = result.filter((o) => o.izvedba === filterIzvedba);
    if (filterHitniRok)
      result = result.filter((o) => !!o.hitni_rok);
    if (sirovineEnabled && filterSirovine) {
      if (filterSirovine === "null") {
        result = result.filter((o) => o.status_sirovine === null);
      } else {
        result = result.filter((o) => o.status_sirovine === filterSirovine);
      }
    }
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
  }, [orders, machines, filterMachine, filterIzvedba, filterHitniRok, filterSirovine, sirovineEnabled, searchQuery]);

  // Filtrirani scheduled
  const filteredScheduled = useMemo(() => {
    let result = scheduleResult.scheduled;
    if (filterMachine)
      result = result.filter((s) => s.order.machine_id === filterMachine);
    if (filterIzvedba)
      result = result.filter((s) => s.order.izvedba === filterIzvedba);
    if (filterHitniRok)
      result = result.filter((s) => !!s.order.hitni_rok);
    return result;
  }, [scheduleResult.scheduled, filterMachine, filterIzvedba, filterHitniRok]);

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
  const expiredCount = scheduleResult.scheduled.filter(
    (s) => s.stanje === "ROK ISTEKAO"
  ).length;
  const hitniRokCount = orders.filter((o) => o.hitni_rok).length;
  const activeCount = orders.filter((o) => o.izvedba !== "ZAVRŠEN").length;

  const handleHoverOrder = (id: string | null) => {
    if (!id) {
      setHoveredOrderId(null);
      setHoveredSplitGroup(null);
      return;
    }
    setHoveredOrderId(id);
    const order = orders.find((o) => o.id === id);
    setHoveredSplitGroup(order?.split_group_id ?? null);
  };

  const handleEditOrder = (order: WorkOrder) => {
    setEditingOrder(order);
  };

  const handleClickOrder = useCallback((id: string) => {
    setFocusedOrderId(null);
    requestAnimationFrame(() => setFocusedOrderId(id));
  }, []);

  const editingSplitSibling = editingOrder?.split_group_id
    ? orders.find(
        (o) => o.split_group_id === editingOrder.split_group_id && o.id !== editingOrder.id
      ) ?? null
    : null;

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

  const hasActiveFilters = !!(filterMachine || filterIzvedba || filterSirovine || filterHitniRok);

  if (machinesLoading || ordersLoading || overridesLoading || roleLoading) {
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
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-white pb-navbar lg:pb-0">
      {/* ======== HEADER ======== */}
      <header className="bg-white border-b border-gray-200 px-3 py-1.5 sm:py-2.5 pt-safe hidden lg:flex items-center justify-between flex-shrink-0">
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
          {/* Sirovine toggle — admin only */}
          {role === "admin" && (
            <button
              onClick={toggleSirovine}
              className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
                sirovineEnabled
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-gray-50 border-gray-200 text-gray-400"
              }`}
              title={sirovineEnabled ? "Sirovine: UKLJUČENO" : "Sirovine: ISKLJUČENO"}
            >
              <div className={`w-7 h-4 rounded-full relative transition-colors ${sirovineEnabled ? "bg-emerald-500" : "bg-gray-300"}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${sirovineEnabled ? "translate-x-3.5" : "translate-x-0.5"}`} />
              </div>
              Sirovine
            </button>
          )}
          {/* PWA refresh button — standalone only */}
          <PwaRefreshButton />
          {/* Info button */}
          <button
            onClick={() => setShowInfo(true)}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-md hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
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
          {expiredCount > 0 && (
            <span className="hidden sm:inline-flex text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold border border-red-300">
              {expiredCount} istekao
            </span>
          )}
          {hitniRokCount > 0 && (
            <span className="hidden sm:inline-flex text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium border border-red-100">
              {hitniRokCount} hitni rok
            </span>
          )}
          {/* Overtime popover — admin only */}
          {role === "admin" && overtimeResult.fixable_count > 0 && (
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowOvertimePopover(!showOvertimePopover)}
                className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium border border-amber-200 hover:bg-amber-100 transition-colors"
              >
                💡 {overtimeResult.fixable_count}
              </button>
              <OvertimePanel
                result={overtimeResult}
                open={showOvertimePopover}
                onClose={() => setShowOvertimePopover(false)}
                onApprove={handleApproveOvertime}
                onApproveAll={handleApproveAllOvertime}
                onUndoApprove={handleUndoApproveOvertime}
              />
            </div>
          )}
          {/* Override modal button — admin only */}
          {role === "admin" && (
            <button
              onClick={() => setShowOverrides(true)}
              className="hidden lg:inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
              title="Posebno radno vrijeme"
            >
              <span>⏰</span>
              {overrides.length > 0 && (
                <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1 rounded-full">{overrides.length}</span>
              )}
            </button>
          )}
          {/* Export PDF */}
          <div className="hidden lg:block">
            <ExportMenu machines={machines} scheduled={scheduleResult.scheduled} overrides={overrides} sirovineEnabled={sirovineEnabled} />
          </div>
          {/* Desktop: Novi nalog button — admin only */}
          {canAdd() && (
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
          )}
          {/* Machines button — admin only */}
          {role === "admin" && (
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
          )}
          {/* Logout */}
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-gray-600 text-[11px] transition-colors"
          >
            Odjava
          </button>
        </div>
      </header>


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
              {sirovineEnabled && (
                <select value={filterSirovine} onChange={(e) => setFilterSirovine(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/5">
                  <option value="">Sve sirovine</option>
                  <option value="IMA">IMA</option>
                  <option value="NEMA">NEMA</option>
                  <option value="CEKA">ČEKA</option>
                  <option value="null">NEPROVJERENO</option>
                </select>
              )}
              <button
                onClick={() => setFilterHitniRok(!filterHitniRok)}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
                  filterHitniRok
                    ? "bg-red-50 border-red-300 text-red-700"
                    : "border-gray-200 text-gray-400 hover:text-gray-600"
                }`}
              >
                🚨 Hitni rok
              </button>
              {hasActiveFilters && (
                <button onClick={() => { setFilterMachine(""); setFilterIzvedba(""); setFilterSirovine(""); setFilterHitniRok(false); }} className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 transition-colors">
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
              onEdit={handleEditOrder}
              hoveredOrderId={hoveredOrderId}
              hoveredSplitGroup={hoveredSplitGroup}
              onHoverOrder={handleHoverOrder}
              focusedOrderId={focusedOrderId}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              canEdit={canEdit}
              canDelete={canDelete}
              canReorder={canReorder}
              sirovineEnabled={sirovineEnabled}
              role={role}
            />
          </div>
        </div>
        <div className="border-t border-gray-200 flex-shrink-0">
          <Timeline
            machines={machines}
            scheduled={scheduleResult.scheduled}
            ganttStartDate={ganttStartDate}
            hoveredOrderId={hoveredOrderId}
            hoveredSplitGroup={hoveredSplitGroup}
            onHoverOrder={handleHoverOrder}
            onClickOrder={handleClickOrder}
            onMoveOrder={handleMoveOrder}
            onUnpinOrder={handleUnpinOrder}
            overrides={overrides}
            sirovineEnabled={sirovineEnabled}
            overtimeSuggestions={role === "admin" ? overtimeResult.suggestions : []}
          />
        </div>
      </div>

      {/* Mobile: tabbed view */}
      <div className="lg:hidden flex-1 min-h-0 overflow-hidden">
        {activeTab === "nalozi" ? (
          <div className="h-full flex flex-col">
            <div className="px-2 py-1.5 flex items-center gap-1.5 flex-shrink-0 bg-white border-b border-gray-100">
              <div className="relative flex-1">
                <svg
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none"
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
                  className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 pl-7 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-300 bg-white placeholder:text-gray-300"
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
                className={`p-1.5 rounded-md border transition-colors ${
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
                {sirovineEnabled && (
                  <select value={filterSirovine} onChange={(e) => setFilterSirovine(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/5">
                    <option value="">Sve sirovine</option>
                    <option value="IMA">IMA</option>
                    <option value="NEMA">NEMA</option>
                    <option value="CEKA">ČEKA</option>
                    <option value="null">NEPROVJERENO</option>
                  </select>
                )}
                <button
                  onClick={() => setFilterHitniRok(!filterHitniRok)}
                  className={`text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
                    filterHitniRok
                      ? "bg-red-50 border-red-300 text-red-700"
                      : "border-gray-200 text-gray-400 hover:text-gray-600"
                  }`}
                >
                  🚨 Hitni rok
                </button>
                {hasActiveFilters && (
                  <button onClick={() => { setFilterMachine(""); setFilterIzvedba(""); setFilterSirovine(""); setFilterHitniRok(false); }} className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 transition-colors">
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
                onEdit={handleEditOrder}
                focusedOrderId={focusedOrderId}
                canEdit={canEdit}
                canDelete={canDelete}
                canReorder={canReorder}
                sirovineEnabled={sirovineEnabled}
                role={role}
              />
            </div>
          </div>
        ) : (
          <div className="h-full">
            <Timeline
              machines={machines}
              scheduled={scheduleResult.scheduled}
              ganttStartDate={ganttStartDate}
              onClickOrder={handleClickOrder}
              onMoveOrder={handleMoveOrder}
              onUnpinOrder={handleUnpinOrder}
              overrides={overrides}
              overtimeSuggestions={role === "admin" ? overtimeResult.suggestions : []}
            />
          </div>
        )}
      </div>

      {/* ======== STATUS BAR ======== */}
      <StatusBar scheduled={scheduleResult.scheduled} machines={machines} />


      {/* ======== BOTTOM NAVBAR (mobile only) ======== */}
      <BottomNavbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAddClick={() => setShowNewOrder(true)}
        canAdd={canAdd()}
        role={role}
        activeOrderCount={activeCount}
        overlapCount={overlapCount}
        lateCount={lateCount}
        criticalCount={criticalCount}
        expiredCount={expiredCount}
        hitniRokCount={hitniRokCount}
        sirovineEnabled={sirovineEnabled}
        onToggleSirovine={toggleSirovine}
        overtimeFixableCount={overtimeResult.fixable_count}
        onShowOvertime={() => setShowOvertimePopover(true)}
        overridesCount={overrides.length}
        onShowOverrides={() => setShowOverrides(true)}
        onShowMachines={() => setShowMachineDialog(true)}
        machines={machines}
        scheduled={scheduleResult.scheduled}
        overrides={overrides}
        onShowInfo={() => setShowInfo(true)}
        onLogout={handleLogout}
      />

      {/* ======== MOBILE: Overtime Panel (triggered from BottomNavbar) ======== */}
      {role === "admin" && overtimeResult.fixable_count > 0 && (
        <div className="sm:hidden">
          <OvertimePanel
            result={overtimeResult}
            open={showOvertimePopover}
            onClose={() => setShowOvertimePopover(false)}
            onApprove={handleApproveOvertime}
            onApproveAll={handleApproveAllOvertime}
            onUndoApprove={handleUndoApproveOvertime}
          />
        </div>
      )}

      {/* ======== BOTTOM SHEET: New Order ======== */}
      <NewOrderSheet
        open={showNewOrder}
        onClose={() => setShowNewOrder(false)}
        machines={machines}
        onAdd={(order, splitPartner) => addOrder(order, splitPartner)}
        role={role}
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

      {/* ======== Override Modal ======== */}
      <OverrideModal
        open={showOverrides}
        onClose={() => setShowOverrides(false)}
        machines={machines}
        overrides={overrides}
        onAdd={addOverride}
        onDelete={deleteOverride}
      />

      {/* ======== Edit Order Dialog ======== */}
      {editingOrder && (
        <EditOrderDialog
          key={editingOrder.id}
          open={!!editingOrder}
          onClose={() => setEditingOrder(null)}
          order={editingOrder}
          splitSibling={editingSplitSibling}
          machines={machines}
          onUpdate={updateOrder}
          onConvertToSplit={convertToSplit}
          onConvertToSingle={convertToSingle}
          canEdit={canEdit}
          role={role}
        />
      )}
    </div>
  );
}
