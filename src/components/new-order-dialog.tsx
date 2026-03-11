"use client";

import { useState } from "react";
import type { Machine, NewWorkOrder } from "@/lib/types";

interface NewOrderSheetProps {
  open: boolean;
  onClose: () => void;
  machines: Machine[];
  onAdd: (order: NewWorkOrder) => Promise<unknown>;
}

export function NewOrderSheet({
  open,
  onClose,
  machines,
  onAdd,
}: NewOrderSheetProps) {
  const [rnId, setRnId] = useState("");
  const [opis, setOpis] = useState("");
  const [napomena, setNapomena] = useState("");
  const [machineId, setMachineId] = useState(machines[0]?.id ?? "");
  const [trajanjeH, setTrajanjeH] = useState("1");
  const [rokIsporuke, setRokIsporuke] = useState("");
  const [redoslijed, setRedoslijed] = useState("");
  const [najraniji, setNajraniji] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const order: NewWorkOrder = {
      machine_id: machineId,
      rn_id: rnId,
      opis: opis || null,
      napomena: napomena || null,
      rok_isporuke: rokIsporuke || null,
      trajanje_h: parseFloat(trajanjeH),
      zeljeni_redoslijed: redoslijed ? parseInt(redoslijed) : null,
      najraniji_pocetak: najraniji || null,
      izvedba: "PLANIRAN",
      sort_order: 0,
    };

    await onAdd(order);
    setSaving(false);

    setRnId("");
    setOpis("");
    setNapomena("");
    setTrajanjeH("1");
    setRokIsporuke("");
    setRedoslijed("");
    setNajraniji("");
    onClose();
  };

  const inputMobile =
    "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white";
  const inputDesktop =
    "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 bg-white";
  const labelClass = "block text-xs font-medium text-gray-600 mb-1";

  const formFields = (compact: boolean) => {
    const ic = compact ? inputDesktop : inputMobile;
    return (
      <div className={compact ? "space-y-2.5" : "space-y-4"}>
        <div className={compact ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-3"}>
          <div>
            <label className={labelClass}>RN ID <span className="text-red-400">*</span></label>
            <input value={rnId} onChange={(e) => setRnId(e.target.value)} required placeholder="npr. RN-001" className={ic} />
          </div>
          <div>
            <label className={labelClass}>Stroj <span className="text-red-400">*</span></label>
            <select value={machineId} onChange={(e) => setMachineId(e.target.value)} required className={ic}>
              {machines.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
            </select>
          </div>
          <div className={compact ? "" : "col-span-2"}>
            <label className={labelClass}>Trajanje (h) <span className="text-red-400">*</span></label>
            <input type="number" step="0.5" min="0.5" value={trajanjeH} onChange={(e) => setTrajanjeH(e.target.value)} required className={ic} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Opis</label>
            <input value={opis} onChange={(e) => setOpis(e.target.value)} placeholder="Opis radnog naloga" className={ic} />
          </div>
          <div>
            <label className={labelClass}>Napomena</label>
            <input value={napomena} onChange={(e) => setNapomena(e.target.value)} placeholder="Dodatne napomene" className={ic} />
          </div>
        </div>
        <div className={compact ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-3"}>
          <div>
            <label className={labelClass}>Rok isporuke</label>
            <input type="date" value={rokIsporuke} onChange={(e) => setRokIsporuke(e.target.value)} className={ic} />
          </div>
          <div>
            <label className={labelClass}>Redoslijed</label>
            <input type="number" min="1" value={redoslijed} onChange={(e) => { setRedoslijed(e.target.value); if (e.target.value) setNajraniji(""); }} placeholder="1, 2, 3..." className={ic} />
          </div>
          <div className={compact ? "" : "col-span-2"}>
            <label className={labelClass}>Najraniji početak</label>
            <input type="date" value={najraniji} onChange={(e) => { setNajraniji(e.target.value); if (e.target.value) setRedoslijed(""); }} className={ic} />
          </div>
        </div>
        <p className="text-[10px] text-gray-400 leading-snug">
          Popuni samo jedno: Redoslijed ili Najraniji početak. Bez toga, nalog
          se raspoređuje automatski po roku (EDD).
        </p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-backdrop"
        onClick={onClose}
      />

      {/* Desktop: compact centered modal */}
      <div className="hidden lg:flex items-center justify-center absolute inset-0 pointer-events-none">
        <div className="bg-white rounded-xl shadow-2xl w-[520px] pointer-events-auto">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Novi radni nalog</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 -mr-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="px-5 py-3">
            {formFields(true)}
            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
              <button type="button" onClick={onClose} className="flex-1 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Odustani
              </button>
              <button type="submit" disabled={saving} className="flex-[2] py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {saving ? "Spremam..." : "Dodaj nalog"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      <div className="lg:hidden absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl animate-sheet-up max-h-[88dvh] flex flex-col shadow-2xl">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-5 pb-3 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900">Novi radni nalog</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 -mr-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-5">
          <div className="pb-4">
            {formFields(false)}
          </div>
          <div className="sticky bottom-0 bg-white pt-3 pb-4 pb-safe border-t border-gray-100 -mx-5 px-5">
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 py-3 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-[0.98] transition-transform">
                Odustani
              </button>
              <button type="submit" disabled={saving} className="flex-[2] py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.98] transition-transform shadow-lg shadow-emerald-600/20">
                {saving ? "Spremam..." : "Dodaj nalog"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
