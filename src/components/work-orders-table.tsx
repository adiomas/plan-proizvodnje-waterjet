"use client";

import { useMemo, useState, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Machine, WorkOrder, ScheduledOrder } from "@/lib/types";
import { formatDayDate, formatTime } from "@/lib/utils";

interface WorkOrdersViewProps {
  orders: WorkOrder[];
  machines: Machine[];
  scheduled: ScheduledOrder[];
  onUpdate: (id: string, updates: Partial<WorkOrder>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (reordered: WorkOrder[]) => Promise<void>;
}

/* ================================================================
   SHARED: Empty State
   ================================================================ */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="mb-3 text-gray-300"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
      <p className="text-sm font-medium text-gray-500">Nema naloga</p>
      <p className="text-xs text-gray-400 mt-1">Dodaj prvi nalog tipkom +</p>
    </div>
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
      className={`mx-3 mb-2 rounded-xl border overflow-hidden transition-all ${
        isOverlap
          ? "border-red-300 bg-red-50/60"
          : isLate
          ? "border-amber-200 bg-amber-50/30"
          : "border-gray-200/80 bg-white"
      } ${isDone ? "opacity-50" : ""}`}
    >
      <div className="flex">
        {/* Machine color bar */}
        <div
          className="w-1 flex-shrink-0"
          style={{ backgroundColor: machine?.color ?? "#94A3B8" }}
        />

        <div className="flex-1 px-3 py-2.5 min-w-0">
          {/* Row 1: RN ID + Duration */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[13px] text-gray-900 truncate">
              {order.rn_id}
            </span>
            <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0 font-medium">
              {order.trajanje_h}h
            </span>
          </div>

          {/* Row 2: Opis */}
          {order.opis && (
            <p className="text-[11px] text-gray-500 truncate mt-0.5 leading-snug">
              {order.opis}
            </p>
          )}

          {/* Row 3: Machine + Schedule */}
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-gray-400 flex-wrap">
            <span
              className="font-medium"
              style={{ color: machine?.color }}
            >
              {machine?.name ?? "—"}
            </span>
            {sched?.start && (
              <>
                <span className="text-gray-300">·</span>
                <span className="tabular-nums">
                  {formatDayDate(sched.start)} {formatTime(sched.start)}
                </span>
                {sched.end && (
                  <>
                    <span className="text-gray-300">→</span>
                    <span className="tabular-nums">
                      {formatDayDate(sched.end)} {formatTime(sched.end)}
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          {/* Row 4: Status badges + Izvedba + Delete */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {sched && sched.status === "OK" && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                OK
              </span>
            )}
            {sched && sched.status !== "OK" && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  sched.status === "PREKLAPANJE"
                    ? "bg-red-100 text-red-700"
                    : sched.status === "GREŠKA UNOSA"
                    ? "bg-red-100 text-red-600"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {sched.status}
              </span>
            )}
            {sched?.stanje && (
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  sched.stanje === "KASNI"
                    ? "bg-red-100 text-red-700"
                    : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {sched.stanje}
              </span>
            )}

            <div className="flex-1" />

            {/* Izvedba toggle */}
            <button
              onClick={cycleIzvedba}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border active:scale-95 transition-transform ${
                order.izvedba === "PLANIRAN"
                  ? "bg-gray-50 border-gray-200 text-gray-600"
                  : order.izvedba === "U TIJEKU"
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
              }`}
            >
              {order.izvedba}
            </button>

            {/* Delete */}
            <button
              onClick={() => onDelete(order.id)}
              className="text-gray-300 active:text-red-500 p-1 -mr-1"
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
          className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs"
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
        className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs"
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
      className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded block truncate min-h-[1.2em]"
    >
      {displayValue ?? (value || "—")}
    </span>
  );
}

/* ================================================================
   DESKTOP: Sortable Row (DnD)
   ================================================================ */

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </tr>
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
  onReorder,
}: {
  orders: WorkOrder[];
  machines: Machine[];
  machineMap: Map<string, Machine>;
  scheduleMap: Map<string, ScheduledOrder>;
  onUpdate: (id: string, updates: Partial<WorkOrder>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (reordered: WorkOrder[]) => Promise<void>;
}) {
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
        id: "drag",
        header: "",
        size: 24,
        cell: () => (
          <span className="text-gray-300 cursor-grab text-xs">&#x2807;</span>
        ),
      },
      {
        accessorKey: "rn_id",
        header: "RN ID",
        size: 80,
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
        cell: ({ row }) => (
          <EditableCell
            value={row.original.najraniji_pocetak ?? ""}
            onSave={(v) =>
              handleFieldUpdate(row.original.id, "najraniji_pocetak", v)
            }
            type="date"
          />
        ),
      },
      {
        id: "start",
        header: "Početak",
        size: 110,
        cell: ({ row }) => {
          const s = scheduleMap.get(row.original.id);
          if (!s?.start) return <span className="text-gray-300">—</span>;
          return (
            <span className="text-xs text-gray-600 tabular-nums">
              {formatDayDate(s.start)} {formatTime(s.start)}
            </span>
          );
        },
      },
      {
        id: "end",
        header: "Kraj",
        size: 110,
        cell: ({ row }) => {
          const s = scheduleMap.get(row.original.id);
          if (!s?.end) return <span className="text-gray-300">—</span>;
          return (
            <span className="text-xs text-gray-600 tabular-nums">
              {formatDayDate(s.end)} {formatTime(s.end)}
            </span>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        size: 100,
        cell: ({ row }) => {
          const s = scheduleMap.get(row.original.id);
          if (!s) return null;
          const colorClass =
            s.status === "OK"
              ? "text-emerald-700 bg-emerald-50"
              : s.status === "PREKLAPANJE"
              ? "text-red-700 bg-red-50 font-bold"
              : s.status === "GREŠKA UNOSA"
              ? "text-red-700 bg-red-50"
              : "text-amber-700 bg-amber-50";
          return (
            <span className={`text-xs px-1.5 py-0.5 rounded ${colorClass}`}>
              {s.status}
            </span>
          );
        },
      },
      {
        id: "stanje",
        header: "Stanje",
        size: 90,
        cell: ({ row }) => {
          const s = scheduleMap.get(row.original.id);
          if (!s?.stanje) return <span className="text-gray-300">—</span>;
          return (
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                s.stanje === "KASNI"
                  ? "text-red-700 bg-red-50 font-bold"
                  : "text-emerald-700 bg-emerald-50"
              }`}
            >
              {s.stanje}
            </span>
          );
        },
      },
      {
        accessorKey: "izvedba",
        header: "Izvedba",
        size: 90,
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
        cell: ({ row }) => (
          <button
            onClick={() => onDelete(row.original.id)}
            className="text-gray-300 hover:text-red-500 text-xs"
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
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orders.findIndex((o) => o.id === active.id);
    const newIndex = orders.findIndex((o) => o.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(orders, oldIndex, newIndex).map((o, i) => ({
      ...o,
      sort_order: i,
    }));
    onReorder(reordered);
  };

  return (
    <div className="overflow-auto h-full">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <table className="w-full text-xs border-collapse">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="bg-[#0C1222] text-white sticky top-0 z-10"
              >
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-1.5 py-2 text-left font-medium whitespace-nowrap text-[11px] tracking-wide uppercase"
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <SortableContext
            items={orders.map((o) => o.id)}
            strategy={verticalListSortingStrategy}
          >
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const s = scheduleMap.get(row.original.id);
                const machine = machineMap.get(row.original.machine_id);
                const isOverlap = s?.status === "PREKLAPANJE";
                const bgColor = isOverlap
                  ? "#F4CCCC"
                  : machine?.color_light
                  ? `${machine.color_light}40`
                  : undefined;

                return (
                  <SortableRow key={row.id} id={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-1.5 py-1 border-b border-gray-200"
                        style={{ backgroundColor: bgColor }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </SortableRow>
                );
              })}
            </tbody>
          </SortableContext>
        </table>
      </DndContext>

      {orders.length === 0 && <EmptyState />}
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
  onReorder,
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
        {/* Spacer for FAB */}
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
          onReorder={onReorder}
        />
      </div>
    </>
  );
}
