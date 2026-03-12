"use client";

import { useEffect, useRef } from "react";

interface SchedulingInfoModalProps {
  open: boolean;
  onClose: () => void;
}

export function SchedulingInfoModal({ open, onClose }: SchedulingInfoModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Desktop: centered modal */}
      <div className="hidden lg:block fixed inset-0 z-50">
        <div
          ref={overlayRef}
          className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
          <div className="relative bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[80vh] flex flex-col pointer-events-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">Upute za raspoređivanje</h2>
              <button
                onClick={onClose}
                className="text-gray-300 hover:text-gray-500 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-3">
              <InfoContent />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      <div className="lg:hidden fixed inset-0 z-50">
        <div
          className="absolute inset-0 bg-black/30"
          onClick={onClose}
        />
        <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[92dvh] flex flex-col animate-sheet-up">
          <div className="flex justify-center py-2.5 flex-shrink-0">
            <div className="w-8 h-1 rounded-full bg-gray-200" />
          </div>
          <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-900">Upute za raspoređivanje</h2>
            <button
              onClick={onClose}
              className="text-gray-300 hover:text-gray-500 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto flex-1 px-4 py-3 pb-[env(safe-area-inset-bottom,16px)]">
            <InfoContent />
          </div>
        </div>
      </div>
    </>
  );
}

function InfoContent() {
  return (
    <div className="space-y-0 divide-y divide-gray-100">
      {/* 1. Kreiranje naloga */}
      <Section title="1. Kreiranje naloga">
        <p>
          <strong>Obavezna polja:</strong> RN ID, Stroj, Trajanje (h)
        </p>
        <p>
          <strong>Opcionalna:</strong> Opis, Napomena, Rok isporuke
        </p>
        <p>
          <strong>Raspoređivanje:</strong> Redoslijed ILI Najraniji početak (ne oba!)
        </p>
      </Section>

      {/* 2. Automatsko raspoređivanje */}
      <Section title="2. Automatsko raspoređivanje (EDD)">
        <p>
          Aktivira se kad nalog <strong>nema</strong> ni Redoslijed ni Najraniji početak.
        </p>
        <ul className="list-disc pl-4 space-y-1 mt-1.5">
          <li>Sortira sve automatske naloge po roku isporuke (najhitniji prvi)</li>
          <li>Nalozi bez roka idu na kraj</li>
          <li>Za svaki nalog traži najraniji slobodan termin na stroju</li>
          <li>Gap-filling: popunjava praznine ispred ručno postavljenih naloga</li>
          <li>Radno vrijeme: 07:00 – 15:00, vikendi se preskaču</li>
          <li>Nalog &le;8h koji ne stane do 15:00 &rarr; idući radni dan 07:00</li>
          <li>Nalozi &gt;8h prelaze na sljedeće dane (overflow)</li>
        </ul>
      </Section>

      {/* 3. Manualno raspoređivanje */}
      <Section title="3. Manualno raspoređivanje">
        <div className="space-y-3">
          <div>
            <p className="font-medium text-gray-800 text-[12px] mb-1">A) Redoslijed — prioritetni broj na stroju</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>1</strong> = prvi na stroju (počinje danas 07:00)</li>
              <li><strong>2</strong> = odmah iza prvog, <strong>3</strong> = iza drugog...</li>
              <li>Sustav automatski pomiče ostale: ako postaviš 2, dotadašnji 2 postaje 3, itd.</li>
              <li>Radi samo unutar istog stroja</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-gray-800 text-[12px] mb-1">B) Najraniji početak — fiksiran datum</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Nalog ne počinje prije tog datuma</li>
              <li>Počinje u 07:00, traži slobodan termin ako je stroj zauzet</li>
              <li>Vikend &rarr; ponedjeljak</li>
            </ul>
          </div>
          <p className="text-amber-600 font-medium">
            Oba popunjena = GREŠKA UNOSA (nalog se ne raspoređuje)
          </p>
        </div>
      </Section>

      {/* 4. Pinanje na Gantt */}
      <Section title="4. Pinanje na Gantt dijagramu">
        <ul className="list-disc pl-4 space-y-1">
          <li>Drag & drop naloga na Gantt postavlja Najraniji početak</li>
          <li>
            <span className="inline-block">📌</span> ikona za otpinanje &rarr; vraća u automatsko raspoređivanje
          </li>
          <li>ZAVRŠEN nalozi i nalozi s Redoslijedom ne mogu se povlačiti</li>
        </ul>
      </Section>

      {/* 5. Statusi izvedbe */}
      <Section title="5. Statusi izvedbe">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">
            PLANIRAN
          </span>
          <span className="text-gray-300">&rarr;</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-900 text-white">
            U TIJEKU
          </span>
          <span className="text-gray-300">&rarr;</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
            ZAVRŠEN
          </span>
        </div>
        <p className="mt-1.5">Klik na badge za ciklus između statusa.</p>
      </Section>

      {/* 6. Status rasporeda */}
      <Section title="6. Status rasporeda">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
            OK
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
            PREKLAPANJE
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
            GREŠKA UNOSA
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            NEMA RASPOREDA
          </span>
        </div>
      </Section>

      {/* 7. Rokovi */}
      <Section title="7. Rokovi">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
            NA VRIJEME
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700">
            KRITIČNO
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">
            KASNI
          </span>
        </div>
        <p className="mt-1.5">
          KRITIČNO = završava 1 radni dan prije roka. KASNI = završava nakon roka.
        </p>
      </Section>

      {/* 8. Višednevni nalozi */}
      <Section title="8. Višednevni nalozi">
        <ul className="list-disc pl-4 space-y-1">
          <li>Nalog od 12h: dan 1 (07:00–15:00 = 8h) + dan 2 (07:00–11:00 = 4h)</li>
          <li>Vikend se preskače: petak 07:00–15:00 &rarr; ponedjeljak 07:00</li>
          <li>Na Gantt dijagramu višednevni nalozi vizualno prelaze preko dana</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <h3 className="text-[13px] font-semibold text-gray-900 mb-2">{title}</h3>
      <div className="text-xs text-gray-600 leading-relaxed space-y-1">
        {children}
      </div>
    </div>
  );
}
