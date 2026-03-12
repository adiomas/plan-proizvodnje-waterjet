# Prekovremeni rad / Radna subota + Fleksibilni "Ne prije" raspored

**Datum:** 2026-03-12
**Status:** Odobreno

## Sažetak

Dva nova featurea za waterjet production planning aplikaciju:

1. **Machine Day Overrides** — mogućnost definiranja produženog radnog vremena ili radne subote per-stroj per-dan
2. **"Ne prije" semantika za najraniji_pocetak** — umjesto fiksnog pina, `najraniji_pocetak` postaje donja granica — scheduler nalog može gurnuti dalje ako ima hitnijih naloga

## Feature 1: Machine Day Overrides

### Baza podataka

Nova tablica `machine_day_overrides`:

```sql
CREATE TABLE machine_day_overrides (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) NOT NULL,
  machine_id  UUID REFERENCES excel_machines(id) ON DELETE CASCADE NOT NULL,
  date        DATE NOT NULL,
  work_start  TIME NOT NULL DEFAULT '07:00',
  work_end    TIME NOT NULL DEFAULT '15:00',
  created_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, machine_id, date)
);

ALTER TABLE machine_day_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own overrides" ON machine_day_overrides
  FOR ALL USING (auth.uid() = user_id);
```

Ključne odluke:
- `UNIQUE(user_id, machine_id, date)` — jedan override po stroju po danu po korisniku
- `ON DELETE CASCADE` na `machine_id` — brisanje stroja briše overridee
- `work_start` / `work_end` su TIME tipovi
- Nema razlikovanja "prekovremeni" vs "radna subota" — oba su override radnog vremena
- Svaki stroj ima nezavisan kalendar — override za Classicu ne utječe na Arpel

### Scheduler logika

Nova funkcija `getWorkingHours(machineId, date, overrides)`:
1. Provjeri postoji li override za taj stroj + dan
2. Ako da → vrati `{ start: override.work_start, end: override.work_end, hours: razlika }`
3. Ako ne → vrati default `{ start: 7, end: 15, hours: 8 }`
4. Ako je vikend BEZ overridea → vrati `null` (neradni dan)
5. Ako je vikend S overrideom → vrati override sate (radna subota)

Kad `getWorkingHours()` vrati `null` (vikend bez overridea), pozivajuće funkcije preskaču taj dan i nastavljaju na sljedeći — ista logika kao danas s `isWeekend()`, samo sada centralizirana.

Utjecaj na postojeće funkcije:
- **`toWorkTime(date, machineId, overrides)`** — umjesto hardkodiranog 7/15, poziva `getWorkingHours()`. Ako je subota s overrideom, NE preskače na ponedjeljak. Ako vrati `null`, ide na sljedeći dan (ponedjeljak).
- **`adjustStartForEOD(start, durationH, machineId, overrides)`** — koristi dinamičan `work_end` za taj stroj taj dan
- **`calculateEnd(start, hours, machineId, overrides)`** — multi-day overflow za svaki dan provjerava override. Petlja dan-po-dan: dohvati `getWorkingHours()` za tekući dan, oduzmi dostupne sate, ako ima ostatka prijeđi na sljedeći radni dan. Npr. petak 8h (ostatak 6h) → subota override 6h → gotovo u subotu 13:00.
- **`computeSchedule(orders, machines, ganttStartDate, overrides)`** — prima `overrides: MachineOverride[]` kao 4. parametar, prosljeđuje ga svim pomoćnim funkcijama

Potpis: `computeSchedule(orders: WorkOrder[], machines: Machine[], ganttStartDate: Date, overrides: MachineOverride[]): ScheduleResult`

### UI — Modal "Radno vrijeme"

Lokacija: Gumb `⏰ Radno vrijeme` u headeru dashboarda.

Modal sadržaj:
- **Header:** "Posebno radno vrijeme" + gumb "+ Dodaj"
- **Tablica:** Stroj | Datum | Od | Do | Sati | Tip | Akcije (briši)
  - Tip se automatski određuje: datum je subota → "Radna subota" badge, inače → "Prekovremeni" badge
  - Sortirana po datumu (najbliži prvi)
- **Forma za dodavanje:**
  - Dropdown: odabir stroja
  - Date picker: odabir datuma
  - Dva time inputa: početak (default 07:00) i kraj (default 15:00)
  - Gumb "Spremi"
- **Validacije:**
  - `work_end` mora biti > `work_start`
  - Ne može duplikat (isti stroj + isti dan)
  - Prošli datumi prikazuju se sivo

Novi hook: `use-overrides.ts`
- `fetchOverrides()` — dohvati sve overridee korisnika
- `addOverride(machineId, date, workStart, workEnd)` — kreiraj
- `deleteOverride(id)` — obriši

### UI — Timeline vizualizacija overridea

**Day zoom:**
- Dan s overrideom ima **širi stupac** — širina = `overrideHours / 8 * normalDayWidth`. Npr. 12h override = `12/8 * 30px = 45px` po satu, ukupno 12 satnih slotova umjesto 8.
- Širina se računa per-dan (svaki dan može imati drugačiju širinu ovisno o overrideima za bilo koji stroj tog dana). Ako bilo koji stroj ima override za taj dan, stupac se proširuje na najduži override.
- Pozadina: blago žuta/zlatna nijansa za taj stroj taj dan
- Satni slotovi prikazuju pune proširene sate (07-19 umjesto 07-15)
- Header stupca: "Sri 18.03. ⚡"
- Scroll pozicija i "← Danas" gumb: koriste kumulativnu širinu stupaca (ne fiksni offset)

**Tjedan/mjesec zoom:**
- Mala žuta točkica ili ⚡ na dnu ćelije za stroj s overrideom
- Bez promjene širine stupca

## Feature 2: "Ne prije" semantika

### Promjena ponašanja `najraniji_pocetak`

Prije: `najraniji_pocetak` = fiksni pin (nalog se ne pomiče).
Poslije: `najraniji_pocetak` = donja granica ("ne počinji prije ovog datuma, ali scheduler te smije gurnuti dalje").

Scheduler logika:
- Nalozi s `najraniji_pocetak` (bez `zeljeni_redoslijed`) ulaze u **automatski** pool umjesto manualnog
- Sortiraju se po `rok_isporuke` zajedno s ostalim auto nalozima (EDD). Ako nema `rok_isporuke`, nalog ide na kraj reda (najniži prioritet).
- Pri traženju slota: `startDate = max(earliestAvailableSlot, najraniji_pocetak)` — scheduler ne smije staviti nalog prije `najraniji_pocetak`, ali ga smije gurnuti dalje
- Hitniji nalog (raniji rok) može zauzeti raniji slot → "ne prije" nalog se pomiče na sljedeći dostupan slot
- Redoslijed u auto poolu: sortiraj po `rok_isporuke ASC` (null ide na kraj), zatim po `sort_order ASC` kao tiebreaker
- Gap-filling logika ostaje ista — "ne prije" nalozi mogu popuniti rupe ali samo ako `rupa.start >= najraniji_pocetak`

Nema promjena u bazi — `najraniji_pocetak` zadržava isto ime i tip.

### UI — "Ne prije" indikator

- Nalozi s `najraniji_pocetak` prikazuju **⏳** umjesto 📌 na timeline baru
- Klik na ⏳ otvara popover s potvrdom:
  - "Ukloniti 'ne prije' datum? Nalog će se rasporediti automatski po roku."
  - Gumbi: [Odustani] [Ukloni]
- U tablici: kolona "Početak od" prikazuje datum s ⏳ ikonom

### Drag & drop prilagodba

- Drag & drop na timeline-u **postavlja ili ažurira** `najraniji_pocetak` — uvijek s "ne prije" semantikom
  - Nalog bez `najraniji_pocetak`: drag postavlja datum → nalog dobiva ⏳
  - Nalog s `najraniji_pocetak`: drag ažurira datum → ⏳ ostaje
  - Nalog sa `zeljeni_redoslijed`: drag onemogućen (isto kao danas)
  - Nalog s `izvedba === "ZAVRŠEN"`: drag onemogućen (isto kao danas)
- Snap logika koristi proširene sate za dane s overrideom
- Subota bez overridea: ne dozvoli drop
- Subota s overrideom: dozvoli snap unutar override sati

## TypeScript tipovi

```typescript
export interface MachineOverride {
  id: string;
  user_id: string;
  machine_id: string;
  date: string;        // ISO date string "2026-03-21"
  work_start: string;  // "07:00"
  work_end: string;    // "19:00"
  created_at: string;
}

// Helper za scheduler
export interface WorkingHours {
  start: number;  // 7
  end: number;    // 19
  hours: number;  // 12
}
// null = neradni dan (vikend bez overridea)
```

## Validacije modala

- `work_start` mora biti >= 00:00 i < 23:00 (realno 05:00-10:00)
- `work_end` mora biti > `work_start`
- Minimalna razlika: 1 sat
- Duplikat (isti stroj + dan): prikaži error "Override za taj stroj i dan već postoji"
- Brisanje overridea: dozvoljeno uvijek (scheduler se recompute-a, nalozi se preurede)

## Promjene po datotekama

| Datoteka | Promjena |
|----------|----------|
| `src/lib/types.ts` | + `MachineOverride` interface |
| `src/lib/utils.ts` | + `getWorkingHours()`, izmjena `toWorkTime()`, `isWeekend()` postaje kontekstualna |
| `src/lib/scheduler.ts` | `computeSchedule()` prima overrides, "ne prije" logika, dinamičke radne sate |
| `src/hooks/use-overrides.ts` | **NOVI** — CRUD za overridee |
| `src/components/override-modal.tsx` | **NOVI** — Modal za upravljanje overrideima |
| `src/components/timeline.tsx` | Širi stupci, ⚡ markeri, ⏳ indikator, popover za unpin, override-aware drag |
| `src/components/work-orders-table.tsx` | ⏳ umjesto 📌 za "ne prije" naloge |
| `src/app/dashboard/page.tsx` | + `useOverrides()` hook, prosljeđuje overrides scheduleru i timeline-u |
| `src/lib/pdf/` | PDF export koristi overridee za ispravne sate u izvještajima |

## Data flow

```
Dashboard mount
    ↓
useOverrides().fetchOverrides()
useWorkOrders().fetchOrders()
useMachines().fetchMachines()
    ↓
computeSchedule(orders, machines, overrides)
    ↓
ScheduleResult → Timeline + Table
```

## Migracija

- Nova tablica `machine_day_overrides` (Supabase migration)
- Nema promjena u `excel_work_orders` tablici
- `najraniji_pocetak` zadržava isto ime — samo scheduler mijenja ponašanje
- Postojeći nalozi s `najraniji_pocetak` automatski dobivaju "ne prije" semantiku
