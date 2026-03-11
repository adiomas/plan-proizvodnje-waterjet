"use client";

import type { Machine } from "@/lib/types";

interface ToolbarProps {
  machines: Machine[];
  filterMachine: string;
  filterStatus: string;
  filterIzvedba: string;
  searchQuery: string;
  onFilterMachine: (v: string) => void;
  onFilterStatus: (v: string) => void;
  onFilterIzvedba: (v: string) => void;
  onSearchChange: (v: string) => void;
  onNewOrder: () => void;
  onOpenMachines: () => void;
  totalOrders: number;
}

export function Toolbar({
  machines,
  filterMachine,
  filterStatus,
  filterIzvedba,
  searchQuery,
  onFilterMachine,
  onFilterStatus,
  onFilterIzvedba,
  onSearchChange,
  onNewOrder,
  onOpenMachines,
  totalOrders,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-white border-b">
      <button
        onClick={onNewOrder}
        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
      >
        + Novi nalog
      </button>

      <button
        onClick={onOpenMachines}
        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded border hover:bg-gray-200"
      >
        Strojevi
      </button>

      <div className="h-4 w-px bg-gray-300 mx-1" />

      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Pretraži..."
          className="text-xs border rounded px-2 py-1.5 pl-7 text-gray-700 w-40 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
        />
        <svg
          className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
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
      </div>

      <select
        value={filterMachine}
        onChange={(e) => onFilterMachine(e.target.value)}
        className="text-xs border rounded px-2 py-1.5 text-gray-700"
      >
        <option value="">Svi strojevi</option>
        {machines.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select
        value={filterStatus}
        onChange={(e) => onFilterStatus(e.target.value)}
        className="text-xs border rounded px-2 py-1.5 text-gray-700"
      >
        <option value="">Svi statusi</option>
        <option value="OK">OK</option>
        <option value="PREKLAPANJE">PREKLAPANJE</option>
        <option value="GREŠKA UNOSA">GREŠKA UNOSA</option>
        <option value="NEMA RASPOREDA">NEMA RASPOREDA</option>
      </select>

      <select
        value={filterIzvedba}
        onChange={(e) => onFilterIzvedba(e.target.value)}
        className="text-xs border rounded px-2 py-1.5 text-gray-700"
      >
        <option value="">Sve izvedbe</option>
        <option value="PLANIRAN">PLANIRAN</option>
        <option value="U TIJEKU">U TIJEKU</option>
        <option value="ZAVRŠEN">ZAVRŠEN</option>
      </select>

      <div className="ml-auto text-xs text-gray-500">
        {totalOrders} {totalOrders === 1 ? "nalog" : "naloga"}
      </div>
    </div>
  );
}
