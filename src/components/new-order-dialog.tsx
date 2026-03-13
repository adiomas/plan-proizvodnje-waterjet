"use client";

import { useState } from "react";
import type { Machine, NewWorkOrder } from "@/lib/types";
import { DateInput, parseDateInput } from "@/components/ui/date-input";

interface NewOrderSheetProps {
  open: boolean;
  onClose: () => void;
  machines: Machine[];
  onAdd: (order: NewWorkOrder, splitPartner?: NewWorkOrder) => Promise<unknown>;
}

export function NewOrderSheet({
  open,
  onClose,
  machines,
  onAdd,
}: NewOrderSheetProps) {
  const [rnId, setRnId] = useState("");
  const [rokIsporuke, setRokIsporuke] = useState("");
  const [rokDisplay, setRokDisplay] = useState("");
  const [isSplit, setIsSplit] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dio A
  const [machineIdA, setMachineIdA] = useState("");
  const [trajanjeA, setTrajanjeA] = useState("1");
  const [opisA, setOpisA] = useState("");
  const [napomenaA, setNapomenaA] = useState("");
  const [redoslijedA, setRedoslijedA] = useState("");
  const [najranijiA, setNajranijiA] = useState("");
  const [najranijiDisplayA, setNajranijiDisplayA] = useState("");

  // Dio B
  const [machineIdB, setMachineIdB] = useState("");
  const [trajanjeB, setTrajanjeB] = useState("1");
  const [opisB, setOpisB] = useState("");
  const [napomenaB, setNapomenaB] = useState("");
  const [redoslijedB, setRedoslijedB] = useState("");
  const [najranijiB, setNajranijiB] = useState("");
  const [najranijiDisplayB, setNajranijiDisplayB] = useState("");

  if (!open) return null;

  const sameMachine = isSplit && machineIdA && machineIdA === machineIdB;

  const resetForm = () => {
    setRnId("");
    setRokIsporuke("");
    setRokDisplay("");
    setIsSplit(false);
    setMachineIdA("");
    setTrajanjeA("1");
    setOpisA("");
    setNapomenaA("");
    setRedoslijedA("");
    setNajranijiA("");
    setNajranijiDisplayA("");
    setMachineIdB("");
    setTrajanjeB("1");
    setOpisB("");
    setNapomenaB("");
    setRedoslijedB("");
    setNajranijiB("");
    setNajranijiDisplayB("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineIdA) return;
    if (isSplit && (!machineIdB || sameMachine)) return;
    setSaving(true);

    const orderA: NewWorkOrder = {
      machine_id: machineIdA,
      rn_id: rnId,
      opis: opisA || null,
      napomena: napomenaA || null,
      rok_isporuke: rokIsporuke || null,
      trajanje_h: parseFloat(trajanjeA),
      zeljeni_redoslijed: redoslijedA ? parseInt(redoslijedA) : null,
      najraniji_pocetak: najranijiA || null,
      izvedba: "PLANIRAN",
      hitno: false,
      status_sirovine: null,
      split_group_id: null,
      split_label: null,
      sort_order: 0,
    };

    if (isSplit) {
      const orderB: NewWorkOrder = {
        machine_id: machineIdB,
        rn_id: rnId,
        opis: opisB || null,
        napomena: napomenaB || null,
        rok_isporuke: rokIsporuke || null,
        trajanje_h: parseFloat(trajanjeB),
        zeljeni_redoslijed: redoslijedB ? parseInt(redoslijedB) : null,
        najraniji_pocetak: najranijiB || null,
        izvedba: "PLANIRAN",
        hitno: false,
        status_sirovine: null,
        split_group_id: null,
        split_label: null,
        sort_order: 0,
      };
      await onAdd(orderA, orderB);
    } else {
      await onAdd(orderA);
    }

    setSaving(false);
    resetForm();
    onClose();
  };

  const inputMobile =
    "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white";
  const inputDesktop =
    "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 bg-white";
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
  ) => {
    const ic = compact ? inputDesktop : inputMobile;
    return (
      <div className={`${isSplit ? "border border-gray-200 rounded-lg p-3" : ""}`}>
        {isSplit && (
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
        )}
        <div className={compact ? "space-y-2" : "space-y-3"}>
          <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-3"}>
            <div>
              <label className={labelClass}>Stroj <span className="text-red-400">*</span></label>
              <select value={machineId} onChange={(e) => setMachineId(e.target.value)} required className={`${ic} ${!machineId ? "text-gray-400" : ""}`}>
                <option value="" disabled>Odaberi stroj...</option>
                {machines.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Trajanje (h) <span className="text-red-400">*</span></label>
              <input type="number" step="0.5" min="0.5" value={trajanje} onChange={(e) => setTrajanje(e.target.value)} required className={ic} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Opis</label>
              <input value={opis} onChange={(e) => setOpis(e.target.value)} placeholder="Opis rada" className={ic} />
            </div>
            <div>
              <label className={labelClass}>Napomena</label>
              <input value={napomena} onChange={(e) => setNapomena(e.target.value)} placeholder="Napomene" className={ic} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Redoslijed</label>
              <input type="number" min="1" value={redoslijed} onChange={(e) => { setRedoslijed(e.target.value); if (e.target.value) setNajraniji(""); }} placeholder="1, 2, 3..." className={ic} />
            </div>
            <div>
              <label className={labelClass}>Najraniji početak</label>
              <DateInput value={najraniji} displayValue={najranijiDisplay} onChange={(iso, disp) => { setNajraniji(iso); setNajranijiDisplay(disp); setRedoslijed(""); }} onDisplayChange={(v) => { setNajranijiDisplay(v); const iso = parseDateInput(v); if (iso) { setNajraniji(iso); setRedoslijed(""); } else if (!v) setNajraniji(""); }} className={ic} />
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
        {/* Dijeljeni: RN ID + Rok */}
        <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-3"}>
          <div>
            <label className={labelClass}>RN ID <span className="text-red-400">*</span></label>
            <input value={rnId} onChange={(e) => setRnId(e.target.value)} required placeholder="npr. RN-001" className={ic} />
          </div>
          <div>
            <label className={labelClass}>Rok isporuke</label>
            <DateInput value={rokIsporuke} displayValue={rokDisplay} onChange={(iso, disp) => { setRokIsporuke(iso); setRokDisplay(disp); }} onDisplayChange={(v) => { setRokDisplay(v); const iso = parseDateInput(v); if (iso) setRokIsporuke(iso); else if (!v) setRokIsporuke(""); }} className={ic} />
          </div>
        </div>

        {/* Split toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isSplit}
            onChange={(e) => setIsSplit(e.target.checked)}
            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
          />
          <span className="text-xs text-gray-600 font-medium">Podijeli na dva stroja</span>
        </label>

        {/* Dio A */}
        {partFields(
          compact, "Dio A",
          machineIdA, setMachineIdA,
          trajanjeA, setTrajanjeA,
          opisA, setOpisA,
          napomenaA, setNapomenaA,
          redoslijedA, setRedoslijedA,
          najranijiA, setNajranijiA,
          najranijiDisplayA, setNajranijiDisplayA,
        )}

        {/* Dio B */}
        {isSplit && partFields(
          compact, "Dio B",
          machineIdB, setMachineIdB,
          trajanjeB, setTrajanjeB,
          opisB, setOpisB,
          napomenaB, setNapomenaB,
          redoslijedB, setRedoslijedB,
          najranijiB, setNajranijiB,
          najranijiDisplayB, setNajranijiDisplayB,
        )}

        {/* Validacijske poruke */}
        {sameMachine && (
          <p className="text-[10px] text-red-500 font-medium">Stroj A i Stroj B moraju biti različiti.</p>
        )}

        <p className="text-[10px] text-gray-400 leading-snug">
          {isSplit
            ? "Oba dijela dijele RN ID i rok. Svaki dio ima vlastiti stroj, trajanje i raspored."
            : "Popuni samo jedno: Redoslijed ili Najraniji početak. Bez toga, nalog se raspoređuje automatski po roku (EDD)."
          }
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
        <div className={`bg-white rounded-xl shadow-2xl pointer-events-auto ${isSplit ? "w-[580px]" : "w-[520px]"} max-h-[90vh] flex flex-col`}>
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-gray-100 flex-shrink-0">
            <h2 className="text-sm font-bold text-gray-900">Novi radni nalog</h2>
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
                {saving ? "Spremam..." : isSplit ? "Dodaj split nalog" : "Dodaj nalog"}
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
              <button type="submit" disabled={saving || !!sameMachine} className="flex-[2] py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.98] transition-transform shadow-lg shadow-emerald-600/20">
                {saving ? "Spremam..." : isSplit ? "Dodaj split nalog" : "Dodaj nalog"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
