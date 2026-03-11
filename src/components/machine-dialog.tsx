"use client";

import { useState } from "react";
import type { Machine } from "@/lib/types";

interface MachineDialogProps {
  open: boolean;
  onClose: () => void;
  machines: Machine[];
  onAdd: (m: Pick<Machine, "name" | "color" | "color_light">) => Promise<Machine | undefined>;
  onUpdate: (id: string, updates: Partial<Machine>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const PRESET_COLORS = [
  { color: "#6AA84F", light: "#CFE8CF" },
  { color: "#3D85C6", light: "#D9E8FB" },
  { color: "#E69138", light: "#F6D5C3" },
  { color: "#CC0000", light: "#F4CCCC" },
  { color: "#9900FF", light: "#E4CCF9" },
  { color: "#E06666", light: "#F9CBCB" },
];

export function MachineDialog({
  open,
  onClose,
  machines,
  onAdd,
  onUpdate,
  onDelete,
}: MachineDialogProps) {
  const [newName, setNewName] = useState("");
  const [newColorIdx, setNewColorIdx] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  if (!open) return null;

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const preset = PRESET_COLORS[newColorIdx];
    await onAdd({
      name: newName.trim(),
      color: preset.color,
      color_light: preset.light,
    });
    setNewName("");
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;
    await onUpdate(id, { name: editName.trim() });
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-800">Upravljanje strojevima</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">
            ×
          </button>
        </div>

        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {machines.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 px-3 py-2 border rounded text-sm"
            >
              <span
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: m.color }}
              />
              {editingId === m.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 border rounded px-2 py-0.5 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(m.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button
                    onClick={() => handleSaveEdit(m.id)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Spremi
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1">{m.name}</span>
                  <button
                    onClick={() => {
                      setEditingId(m.id);
                      setEditName(m.name);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Uredi
                  </button>
                  <button
                    onClick={() => onDelete(m.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Obriši
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-gray-500 mb-2">Dodaj novi stroj</p>
          <div className="flex gap-2 items-center">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Naziv stroja"
              className="flex-1 border rounded px-2 py-1.5 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
            <div className="flex gap-1">
              {PRESET_COLORS.map((c, i) => (
                <button
                  key={c.color}
                  onClick={() => setNewColorIdx(i)}
                  className={`w-5 h-5 rounded-full border-2 ${
                    i === newColorIdx ? "border-gray-800" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c.color }}
                />
              ))}
            </div>
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
            >
              Dodaj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
