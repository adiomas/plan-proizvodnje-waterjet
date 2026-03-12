"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type OnChangeFn,
} from "@tanstack/react-table";
import type { Machine, WorkOrder, ScheduledOrder } from "@/lib/types";
import { formatDayDate, formatTime } from "@/lib/utils";

interface WorkOrdersViewProps {
  orders: WorkOrder[];
  machines: Machine[];
  scheduled: ScheduledOrder[];
  onUpdate: (id: string, updates: Partial<WorkOrder>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  hoveredOrderId?: string | null;
  onHoverOrder?: (id: string | null) => void;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
}

/* Exported column metadata for external ColumnToggle rendering */
export const TOGGLEABLE_COLUMNS = [
  { id: "rn_id", header: "RN ID" },
  { id: "opis", header: "Opis" },
  { id: "napomena", header: "Napomena" },
  { id: "rok_isporuke", header: "Rok" },
  { id: "machine_id", header: "Stroj" },
  { id: "trajanje_h", header: "Trajanje (h)" },
  { id: "zeljeni_redoslijed", header: "Redoslijed" },
  { id: "najraniji_pocetak", header: "Početak od" },
  { id: "start", header: "Početak" },
  { id: "end", header: "Kraj" },
  { id: "status", header: "Status" },
  { id: "stanje", header: "Stanje" },
  { id: "izvedba", header: "Izvedba" },
];

export const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  napomena: false,
  najraniji_pocetak: false,
};

/* ================================================================
   SHARED: Empty State
   ================================================================ */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="mb-3 text-gray-200"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
      <p className="text-xs font-medium text-gray-400">Nema naloga</p>
      <p className="text-[11px] text-gray-300 mt-1">Dodaj prvi nalog tipkom +</p>
    </div>
  );
}

/* ================================================================
   SHARED: Status/Stanje Badge
   ================================================================ */

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "OK"
      ? "bg-emerald-50 text-emerald-600"
      : status === "PREKLAPANJE"
      ? "bg-red-50 text-red-600 border border-red-200"
      : status === "GREŠKA UNOSA"
      ? "bg-amber-50 text-amber-600"
      : status === "NEMA RASPOREDA"
      ? "bg-gray-100 text-gray-500"
      : "bg-gray-100 text-gray-500";
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${style}`}>
      {status}
    </span>
  );
}

function StanjeBadge({ stanje }: { stanje: string }) {
  const style =
    stanje === "KASNI"
      ? "bg-red-50 text-red-600"
      : stanje === "KRITIČNO"
      ? "bg-yellow-50 text-yellow-700"
      : stanje === "BEZ ROKA"
      ? "bg-gray-50 text-gray-400"
      : "bg-blue-50 text-blue-600";
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${style}`}>
      {stanje}
    </span>
  );
}

/* ================================================================
   MOBILE: Order Card
   ================================================================ */

function OrderCard({
  order,
  machine,
  sched,
  onUpdate,
  onDelete,
}: {
  order: WorkOrder;
  machine: Machine | undefined;
  sched: ScheduledOrder | undefined;
  onUpdate: (id: string, updates: Partial<WorkOrder>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const isOverlap = sched?.status === "PREKLAPANJE";
  const isLate = sched?.stanje === "KASNI";
  const isCritical = sched?.stanje === "KRITIČNO";
  const isDone = order.izvedba === "ZAVRŠEN";

  const cycleIzvedba = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next =
      order.izvedba === "PLANIRAN"
        ? "U TIJEKU"
        : order.izvedba === "U TIJEKU"
        ? "ZAVRŠEN"
        : "PLANIRAN";
    onUpdate(order.id, { izvedba: next });
  };

  return (
    <div
      className={`mx-3 mb-2 rounded-lg border overflow-hidden transition-all ${
        isOverlap
          ? "border-red-200 bg-red-50/40"
          : isLate
          ? "border-amber-200 bg-amber-50/30"
          : isCritical
          ? "border-yellow-200 bg-yellow-50/30"
          : "border-gray-200 bg-white"
      } ${isDone ? "opacity-40" : ""}`}
    >
      <div className="flex">
        <div
          className="w-0.5 flex-shrink-0"
          style={{ backgroundColor: machine?.color ?? "#D1D5DB" }}
        />
        <div className="flex-1 px-3 py-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[13px] text-gray-900 truncate">
              {order.rn_id}
            </span>
            <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">
              {order.trajanje_h}h
            </span>
          </div>
          {order.opis && (
            <p className="text-[11px] text-gray-500 truncate mt-0.5 leading-snug">
              {order.opis}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-gray-400 flex-wrap">
            <span className="font-medium text-gray-500">
              {machine?.name ?? "—"}
            </span>
            {sched?.start && (
              <>
                <span className="text-gray-200">·</span>
                <span className="tabular-nums">
                  {formatDayDate(sched.start)} {formatTime(sched.start)}
                </span>
                {sched.end && (
                  <>
                    <span className="text-gray-200">→</span>
                    <span className="tabular-nums">
                      {formatDayDate(sched.end)} {formatTime(sched.end)}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {sched && <StatusBadge status={sched.status} />}
            {sched?.stanje && <StanjeBadge stanje={sched.stanje} />}
            <div className="flex-1" />
            <button
              onClick={cycleIzvedba}
              className={`text-[10px] font-medium px-2.5 py-1 rounded border active:scale-95 transition-transform ${
                order.izvedba === "PLANIRAN"
                  ? "bg-white border-gray-200 text-gray-500"
                  : order.izvedba === "U TIJEKU"
                  ? "bg-gray-900 border-gray-900 text-white"
                  : "bg-gray-100 border-gray-200 text-gray-400"
              }`}
            >
              {order.izvedba}
            </button>
            <button
              onClick={() => onDelete(order.id)}
              className="text-gray-200 active:text-red-500 p-1 -mr-1"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   DESKTOP: Editable Cell
   ================================================================ */

function EditableCell({
  value,
  displayValue,
  onSave,
  type = "text",
  options,
}: {
  value: string;
  displayValue?: string;
  onSave: (v: string) => void;
  type?: "text" | "number" | "date" | "select";
  options?: { value: string; label: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    if (type === "select" && options) {
      return (
        <select
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onSave(e.target.value);
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
          autoFocus
          className="w-full bg-white border border-gray-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-gray-400"
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onSave(draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSave(draft);
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        className="w-full bg-white border border-gray-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-gray-400"
        step={type === "number" ? "0.5" : undefined}
      />
    );
  }

  return (
    <span
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded block truncate min-h-[1.2em]"
    >
      {displayValue ?? (value || "—")}
    </span>
  );
}

/* ================================================================
   DESKTOP: Column Visibility Dropdown
   ================================================================ */

export function ColumnToggle({
  columns,
}: {
  columns: { id: string; header: string; isVisible: boolean; toggle: (event: unknown) => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-xs border rounded-md px-2.5 py-1.5 transition-colors ${
          open
            ? "bg-[#f0f4f8] border-[#d0d5dd] text-[#344054]"
            : "border-[#d0d5dd] text-[#475467] hover:bg-[#f9fafb]"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
        Stupci
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-[#eaecf0] rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
          {columns.map((col) => (
            <label
              key={col.id}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#344054] hover:bg-[#f9fafb] cursor-pointer"
            >
              <input
                type="checkbox"
                checked={col.isVisible}
                onChange={col.toggle}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
              />
              {col.header}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   DESKTOP: Sort Indicator
   ================================================================ */

function SortIcon({ direction }: { direction: "asc" | "desc" | false }) {
  if (!direction) {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" className="inline ml-1 text-[#98a2b3]">
        <path d="M5 2L7 4.5H3L5 2Z" fill="currentColor" opacity="0.4" />
        <path d="M5 8L3 5.5H7L5 8Z" fill="currentColor" opacity="0.4" />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="inline ml-1 text-[#344054]">
      {direction === "asc" ? (
        <path d="M5 2L7.5 5.5H2.5L5 2Z" fill="currentColor" />
      ) : (
        <path d="M5 8L2.5 4.5H7.5L5 8Z" fill="currentColor" />
      )}
    </svg>
  );
}

/* ================================================================
   DESKTOP: Full Table
   ================================================================ */

function DesktopTable({
  orders,
  machines,
  machineMap,
  scheduleMap,
  onUpdate,
  onDelete,
  hoveredOrderId,
  onHoverOrder,
  columnVisibility,
  onColumnVisibilityChange,
}: {
  orders: WorkOrder[];
  machines: Machine[];
  machineMap: Map<string, Machine>;
  scheduleMap: Map<string, ScheduledOrder>;
  onUpdate: (id: string, updates: Partial<WorkOrder>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  hoveredOrderId?: string | null;
  onHoverOrder?: (id: string | null) => void;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const handleFieldUpdate = useCallback(
    (orderId: string, field: keyof WorkOrder, rawValue: string) => {
      let value: string | number | null = rawValue;
      if (field === "trajanje_h") {
        value = parseFloat(rawValue) || 0;
      } else if (field === "zeljeni_redoslijed") {
        value = rawValue ? parseInt(rawValue) : null;
      } else if (field === "rok_isporuke" || field === "najraniji_pocetak") {
        value = rawValue || null;
      } else if (field === "opis" || field === "napomena") {
        value = rawValue || null;
      }
      onUpdate(orderId, { [field]: value });
    },
    [onUpdate]
  );

  const columns: ColumnDef<WorkOrder>[] = useMemo(
    () => [
      {
        accessorKey: "rn_id",
        header: "RN ID",
        size: 80,
        enableSorting: true,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.rn_id}
            onSave={(v) => handleFieldUpdate(row.original.id, "rn_id", v)}
          />
        ),
      },
      {
        accessorKey: "opis",
        header: "Opis",
        size: 140,
        enableSorting: false,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.opis ?? ""}
            onSave={(v) => handleFieldUpdate(row.original.id, "opis", v)}
          />
        ),
      },
      {
        accessorKey: "napomena",
        header: "Napomena",
        size: 120,
        enableSorting: false,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.napomena ?? ""}
            onSave={(v) => handleFieldUpdate(row.original.id, "napomena", v)}
          />
        ),
      },
      {
        accessorKey: "rok_isporuke",
        header: "Rok",
        size: 100,
        enableSorting: true,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.rok_isporuke ?? ""}
            onSave={(v) =>
              handleFieldUpdate(row.original.id, "rok_isporuke", v)
            }
            type="date"
          />
        ),
      },
      {
        accessorKey: "machine_id",
        header: "Stroj",
        size: 100,
        enableSorting: true,
        sortingFn: (rowA, rowB) => {
          const a = machineMap.get(rowA.original.machine_id)?.name ?? "";
          const b = machineMap.get(rowB.original.machine_id)?.name ?? "";
          return a.localeCompare(b);
        },
        cell: ({ row }) => {
          const machine = machineMap.get(row.original.machine_id);
          return (
            <EditableCell
              value={row.original.machine_id}
              displayValue={machine?.name ?? "—"}
              onSave={(v) =>
                handleFieldUpdate(row.original.id, "machine_id", v)
              }
              type="select"
              options={machines.map((m) => ({ value: m.id, label: m.name }))}
            />
          );
        },
      },
      {
        accessorKey: "trajanje_h",
        header: "Trajanje (h)",
        size: 80,
        enableSorting: true,
        cell: ({ row }) => (
          <EditableCell
            value={String(row.original.trajanje_h)}
            onSave={(v) =>
              handleFieldUpdate(row.original.id, "trajanje_h", v)
            }
            type="number"
          />
        ),
      },
      {
        accessorKey: "zeljeni_redoslijed",
        header: "Redoslijed",
        size: 80,
        enableSorting: true,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.zeljeni_redoslijed?.toString() ?? ""}
            onSave={(v) =>
              handleFieldUpdate(row.original.id, "zeljeni_redoslijed", v)
            }
            type="number"
          />
        ),
      },
      {
        accessorKey: "najraniji_pocetak",
        header: "Početak od",
        size: 100,
        enableSorting: true,
        cell: ({ row }) => {
          const val = row.original.najraniji_pocetak;
          if (!val) {
            return (
              <EditableCell
                value=""
                onSave={(v) =>
                  handleFieldUpdate(row.original.id, "najraniji_pocetak", v)
                }
                type="date"
              />
            );
          }
          return (
            <div className="flex items-center gap-1">
              <EditableCell
                value={val}
                onSave={(v) =>
                  handleFieldUpdate(row.original.id, "najraniji_pocetak", v)
                }
                type="date"
              />
              <button
                onClick={() => onUpdate(row.original.id, { najraniji_pocetak: null })}
                className="text-gray-300 hover:text-red-500 text-xs flex-shrink-0"
                title="Otkači"
              >
                ✕
              </button>
            </div>
          );
        },
      },
      {
        id: "start",
        header: "Početak",
        size: 120,
        enableSorting: false,
        cell: ({ row }) => {
          const s = scheduleMap.get(row.original.id);
          if (!s?.start) return <span className="text-[#98a2b3]">—</span>;
          return (
            <span className="text-xs text-[#475467] tabular-nums">
              {formatDayDate(s.start)} {formatTime(s.start)}
            </span>
          );
        },
      },
      {
        id: "end",
        header: "Kraj",
        size: 120,
        enableSorting: false,
        cell: ({ row }) => {
          const s = scheduleMap.get(row.original.id);
          if (!s?.end) return <span className="text-[#98a2b3]">—</span>;
          return (
            <span className="text-xs text-[#475467] tabular-nums">
              {formatDayDate(s.end)} {formatTime(s.end)}
            </span>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        size: 110,
        enableSorting: false,
        cell: ({ row }) => {
          const s = scheduleMap.get(row.original.id);
          if (!s) return null;
          return <StatusBadge status={s.status} />;
        },
      },
      {
        id: "stanje",
        header: "Stanje",
        size: 100,
        enableSorting: false,
        cell: ({ row }) => {
          const s = scheduleMap.get(row.original.id);
          if (!s?.stanje) return <span className="text-[#98a2b3]">—</span>;
          return <StanjeBadge stanje={s.stanje} />;
        },
      },
      {
        accessorKey: "izvedba",
        header: "Izvedba",
        size: 90,
        enableSorting: true,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.izvedba}
            onSave={(v) => handleFieldUpdate(row.original.id, "izvedba", v)}
            type="select"
            options={[
              { value: "PLANIRAN", label: "PLANIRAN" },
              { value: "U TIJEKU", label: "U TIJEKU" },
              { value: "ZAVRŠEN", label: "ZAVRŠEN" },
            ]}
          />
        ),
      },
      {
        id: "actions",
        header: "",
        size: 30,
        enableSorting: false,
        cell: ({ row }) => (
          <button
            onClick={() => onDelete(row.original.id)}
            className="text-[#d0d5dd] hover:text-red-500 text-xs transition-colors"
            title="Obriši nalog"
          >
            &#x2715;
          </button>
        ),
      },
    ],
    [machineMap, machines, scheduleMap, handleFieldUpdate, onDelete]
  );

  const table = useReactTable({
    data: orders,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: onColumnVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full text-xs border-collapse">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="bg-[#f0f4f8] sticky top-0 z-10 border-b-2 border-[#d0d5dd]"
              >
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      className={`px-2 py-2.5 text-left font-semibold whitespace-nowrap text-[10px] tracking-wide uppercase text-[#344054] ${
                        canSort ? "cursor-pointer select-none hover:bg-[#e8f0fe]" : ""
                      }`}
                      style={{ width: header.getSize() }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="flex items-center">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {canSort && (
                          <SortIcon direction={header.column.getIsSorted()} />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => {
              const s = scheduleMap.get(row.original.id);
              const isOverlap = s?.status === "PREKLAPANJE";
              const isHovered = hoveredOrderId === row.original.id;
              const zebraClass = rowIndex % 2 === 0 ? "bg-white" : "bg-[#f9fafb]";

              const rowBg = isHovered
                ? "bg-blue-50 ring-2 ring-blue-400 ring-inset"
                : isOverlap
                ? "bg-red-50/50"
                : zebraClass;

              return (
                <tr
                  key={row.id}
                  className={`border-b border-[#eaecf0] transition-colors ${rowBg}`}
                  onMouseEnter={() => onHoverOrder?.(row.original.id)}
                  onMouseLeave={() => onHoverOrder?.(null)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-2 py-1.5"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {orders.length === 0 && <EmptyState />}
      </div>
    </div>
  );
}

/* ================================================================
   MAIN EXPORT: Responsive View
   ================================================================ */

export function WorkOrdersView({
  orders,
  machines,
  scheduled,
  onUpdate,
  onDelete,
  hoveredOrderId,
  onHoverOrder,
  columnVisibility,
  onColumnVisibilityChange,
}: WorkOrdersViewProps) {
  const machineMap = useMemo(() => {
    const m = new Map<string, Machine>();
    for (const machine of machines) m.set(machine.id, machine);
    return m;
  }, [machines]);

  const scheduleMap = useMemo(() => {
    const m = new Map<string, ScheduledOrder>();
    for (const s of scheduled) m.set(s.order.id, s);
    return m;
  }, [scheduled]);

  return (
    <>
      {/* === MOBILE: Card List === */}
      <div className="md:hidden py-2 h-full overflow-auto">
        {orders.length === 0 ? (
          <EmptyState />
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              machine={machineMap.get(order.machine_id)}
              sched={scheduleMap.get(order.id)}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))
        )}
        <div className="h-20" />
      </div>

      {/* === DESKTOP: Full Table === */}
      <div className="hidden md:block h-full">
        <DesktopTable
          orders={orders}
          machines={machines}
          machineMap={machineMap}
          scheduleMap={scheduleMap}
          onUpdate={onUpdate}
          onDelete={onDelete}
          hoveredOrderId={hoveredOrderId}
          onHoverOrder={onHoverOrder}
          columnVisibility={columnVisibility ?? DEFAULT_COLUMN_VISIBILITY}
          onColumnVisibilityChange={onColumnVisibilityChange ?? (() => {})}
        />
      </div>
    </>
  );
}
