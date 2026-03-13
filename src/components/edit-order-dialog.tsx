"use client";

import { useState } from "react";
import type { Machine, WorkOrder } from "@/lib/types";
import { DateInput, parseDateInput, isoToDisplay } from "@/components/ui/date-input";

interface EditOrderDialogProps {
  open: boolean;
  onClose: () => void;
  order: WorkOrder;
  splitSibling: WorkOrder | null;
  machines: Machine[];
  onUpdate: (id: string, updates: Partial<WorkOrder>) => Promise<void>;
  canEdit?: (field?: string) => boolean;
}

export function EditOrderDialog({
  open,
  onClose,
  order,
  splitSibling,
  machines,
  onUpdate,
  canEdit,
}: EditOrderDialogProps) {
  const isSplit = !!splitSibling;

  // Shared fields
  const [rnId, setRnId] = useState(order.rn_id);
  const [rokIsporuke, setRokIsporuke] = useState(order.rok_isporuke ?? "");
  const [rokDisplay, setRokDisplay] = useState(isoToDisplay(order.rok_isporuke ?? ""));
  const [hitno, setHitno] = useState(order.hitno);

  // Dio A
  const [machineIdA, setMachineIdA] = useState(order.machine_id);
  const [trajanjeA, setTrajanjeA] = useState(String(order.trajanje_h));
  const [opisA, setOpisA] = useState(order.opis ?? "");
  const [napomenaA, setNapomenaA] = useState(order.napomena ?? "");
  const [redoslijedA, setRedoslijedA] = useState(order.zeljeni_redoslijed?.toString() ?? "");
  const [najranijiA, setNajranijiA] = useState(order.najraniji_pocetak ?? "");
  const [najranijiDisplayA, setNajranijiDisplayA] = useState(isoToDisplay(order.najraniji_pocetak ?? ""));
  const [izvedbaA, setIzvedbaA] = useState<WorkOrder["izvedba"]>(order.izvedba);

  // Dio B
  const [machineIdB, setMachineIdB] = useState(splitSibling?.machine_id ?? "");
  const [trajanjeB, setTrajanjeB] = useState(String(splitSibling?.trajanje_h ?? 1));
  const [opisB, setOpisB] = useState(splitSibling?.opis ?? "");
  const [napomenaB, setNapomenaB] = useState(splitSibling?.napomena ?? "");
  const [redoslijedB, setRedoslijedB] = useState(splitSibling?.zeljeni_redoslijed?.toString() ?? "");
  const [najranijiB, setNajranijiB] = useState(splitSibling?.najraniji_pocetak ?? "");
  const [najranijiDisplayB, setNajranijiDisplayB] = useState(isoToDisplay(splitSibling?.najraniji_pocetak ?? ""));
  const [izvedbaB, setIzvedbaB] = useState<WorkOrder["izvedba"]>(splitSibling?.izvedba ?? "PLANIRAN");

  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const sameMachine = isSplit && machineIdA && machineIdA === machineIdB;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineIdA) return;
    if (isSplit && (!machineIdB || sameMachine)) return;
    setSaving(true);

    // Update order A (includes shared fields — hook auto-syncs to sibling)
    await onUpdate(order.id, {
      rn_id: rnId,
      rok_isporuke: rokIsporuke || null,
      hitno,
      machine_id: machineIdA,
      trajanje_h: parseFloat(trajanjeA),
      opis: opisA || null,
      napomena: napomenaA || null,
      zeljeni_redoslijed: redoslijedA ? parseInt(redoslijedA) : null,
      najraniji_pocetak: najranijiA || null,
      izvedba: izvedbaA,
    });

    // Update order B (per-part fields only)
    if (isSplit && splitSibling) {
      await onUpdate(splitSibling.id, {
        machine_id: machineIdB,
        trajanje_h: parseFloat(trajanjeB),
        opis: opisB || null,
        napomena: napomenaB || null,
        zeljeni_redoslijed: redoslijedB ? parseInt(redoslijedB) : null,
        najraniji_pocetak: najranijiB || null,
        izvedba: izvedbaB,
      });
    }

    setSaving(false);
    onClose();
  };

  const inputMobile =
    "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white disabled:bg-gray-50 disabled:text-gray-400";
  const inputDesktop =
    "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 bg-white disabled:bg-gray-50 disabled:text-gray-400";
  const labelClass = "block text-xs font-medium text-gray-600 mb-1";

  const partFields = (
    compact: boolean,
    label: string,
    machineId: string,
    setMachineId: (v: string) => void,
    trajanje: string,
    setTrajanje: (v: string) => void,
    opis: string,
    setOpis: (v: string) => void,
    napomena: string,
    setNapomena: (v: string) => void,
    redoslijed: string,
    setRedoslijed: (v: string) => void,
    najraniji: string,
    setNajraniji: (v: string) => void,
    najranijiDisplay: string,
    setNajranijiDisplay: (v: string) => void,
    izvedba: WorkOrder["izvedba"],
    setIzvedba: (v: WorkOrder["izvedba"]) => void,
  ) => {
    const ic = compact ? inputDesktop : inputMobile;
    return (
      <div className={`${isSplit ? "border border-gray-200 rounded-lg p-3" : ""}`}>
        {isSplit && (
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
        )}
        <div className={compact ? "space-y-2" : "space-y-3"}>
          <div className={compact ? "grid grid-cols-3 gap-2" : "grid grid-cols-3 gap-3"}>
            <div>
              <label className={labelClass}>Stroj <span className="text-red-400">*</span></label>
              <select value={machineId} onChange={(e) => setMachineId(e.target.value)} required disabled={!canEdit?.("machine_id")} className={`${ic} ${!machineId ? "text-gray-400" : ""}`}>
                <option value="" disabled>Odaberi...</option>
                {machines.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Trajanje (h) <span className="text-red-400">*</span></label>
              <input type="number" step="0.5" min="0.5" value={trajanje} onChange={(e) => setTrajanje(e.target.value)} required disabled={!canEdit?.("trajanje_h")} className={ic} />
            </div>
            <div>
              <label className={labelClass}>Izvedba</label>
              <select value={izvedba} onChange={(e) => setIzvedba(e.target.value as WorkOrder["izvedba"])} disabled={!canEdit?.("izvedba")} className={ic}>
                <option value="PLANIRAN">PLANIRAN</option>
                <option value="U TIJEKU">U TIJEKU</option>
                <option value="ZAVRŠEN">ZAVRŠEN</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Opis</label>
              <input value={opis} onChange={(e) => setOpis(e.target.value)} placeholder="Opis rada" disabled={!canEdit?.("opis")} className={ic} />
            </div>
            <div>
              <label className={labelClass}>Napomena</label>
              <input value={napomena} onChange={(e) => setNapomena(e.target.value)} placeholder="Napomene" disabled={!canEdit?.("napomena")} className={ic} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Redoslijed</label>
              <input type="number" min="1" value={redoslijed} onChange={(e) => { setRedoslijed(e.target.value); if (e.target.value) { setNajraniji(""); setNajranijiDisplay(""); } }} placeholder="1, 2, 3..." disabled={!canEdit?.("zeljeni_redoslijed")} className={ic} />
            </div>
            <div>
              <label className={labelClass}>Najraniji početak</label>
              <DateInput value={najraniji} displayValue={najranijiDisplay} onChange={(iso, disp) => { setNajraniji(iso); setNajranijiDisplay(disp); setRedoslijed(""); }} onDisplayChange={(v) => { setNajranijiDisplay(v); const iso = parseDateInput(v); if (iso) { setNajraniji(iso); setRedoslijed(""); } else if (!v) setNajraniji(""); }} disabled={!canEdit?.("najraniji_pocetak")} className={ic} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const formFields = (compact: boolean) => {
    const ic = compact ? inputDesktop : inputMobile;
    return (
      <div className={compact ? "space-y-2.5" : "space-y-4"}>
        {/* Shared: RN ID + Rok + Hitno */}
        <div className={compact ? "grid grid-cols-3 gap-2" : "grid grid-cols-3 gap-3"}>
          <div>
            <label className={labelClass}>RN ID <span className="text-red-400">*</span></label>
            <input value={rnId} onChange={(e) => setRnId(e.target.value)} required disabled={!canEdit?.("rn_id")} className={ic} />
          </div>
          <div>
            <label className={labelClass}>Rok isporuke</label>
            <DateInput value={rokIsporuke} displayValue={rokDisplay} onChange={(iso, disp) => { setRokIsporuke(iso); setRokDisplay(disp); }} onDisplayChange={(v) => { setRokDisplay(v); const iso = parseDateInput(v); if (iso) setRokIsporuke(iso); else if (!v) setRokIsporuke(""); }} disabled={!canEdit?.("rok_isporuke")} className={ic} />
          </div>
          <div>
            <label className={labelClass}>Hitno</label>
            <button
              type="button"
              onClick={() => canEdit?.("hitno") && setHitno(!hitno)}
              disabled={!canEdit?.("hitno")}
              className={`w-full text-xs font-medium px-2.5 ${compact ? "py-1.5 rounded-lg" : "py-2.5 rounded-xl"} border transition-colors ${
                hitno
                  ? "bg-red-50 border-red-300 text-red-700"
                  : "bg-white border-gray-200 text-gray-400"
              } ${!canEdit?.("hitno") ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-80"}`}
            >
              {hitno ? "DA" : "NE"}
            </button>
          </div>
        </div>

        {isSplit && (
          <p className="text-[10px] text-gray-400 font-medium">Split nalog — oba dijela prikazana ispod</p>
        )}

        {/* Dio A */}
        {partFields(
          compact, isSplit ? `Dio ${order.split_label ?? "A"}` : "",
          machineIdA, setMachineIdA,
          trajanjeA, setTrajanjeA,
          opisA, setOpisA,
          napomenaA, setNapomenaA,
          redoslijedA, setRedoslijedA,
          najranijiA, setNajranijiA,
          najranijiDisplayA, setNajranijiDisplayA,
          izvedbaA, setIzvedbaA,
        )}

        {/* Dio B */}
        {isSplit && partFields(
          compact, `Dio ${splitSibling?.split_label ?? "B"}`,
          machineIdB, setMachineIdB,
          trajanjeB, setTrajanjeB,
          opisB, setOpisB,
          napomenaB, setNapomenaB,
          redoslijedB, setRedoslijedB,
          najranijiB, setNajranijiB,
          najranijiDisplayB, setNajranijiDisplayB,
          izvedbaB, setIzvedbaB,
        )}

        {sameMachine && (
          <p className="text-[10px] text-red-500 font-medium">Stroj A i Stroj B moraju biti različiti.</p>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 animate-backdrop" onClick={onClose} />

      {/* Desktop: compact centered modal */}
      <div className="hidden lg:flex items-center justify-center absolute inset-0 pointer-events-none">
        <div className={`bg-white rounded-xl shadow-2xl pointer-events-auto ${isSplit ? "w-[580px]" : "w-[520px]"} max-h-[90vh] flex flex-col`}>
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-gray-100 flex-shrink-0">
            <h2 className="text-sm font-bold text-gray-900">Uredi radni nalog</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 -mr-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="px-5 py-3 overflow-auto flex-1">
            {formFields(true)}
            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
              <button type="button" onClick={onClose} className="flex-1 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Odustani
              </button>
              <button type="submit" disabled={saving || !!sameMachine} className="flex-[2] py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {saving ? "Spremam..." : "Spremi promjene"}
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
          <h2 className="text-base font-bold text-gray-900">Uredi radni nalog</h2>
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
              <button type="submit" disabled={saving || !!sameMachine} className="flex-[2] py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.98] transition-transform shadow-lg shadow-emerald-600/20">
                {saving ? "Spremam..." : "Spremi promjene"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
