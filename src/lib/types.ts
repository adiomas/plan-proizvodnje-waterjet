export interface Machine {
  id: string;
  user_id: string;
  name: string;
  color: string;
  color_light: string;
  sort_order: number;
  created_at: string;
}

export type StatusSirovine = "IMA" | "NEMA" | "CEKA" | null;

export interface WorkOrder {
  id: string;
  user_id: string;
  machine_id: string;
  rn_id: string;
  opis: string | null;
  napomena: string | null;
  rok_isporuke: string | null;
  trajanje_h: number;
  zeljeni_redoslijed: number | null;
  najraniji_pocetak: string | null;
  izvedba: "PLANIRAN" | "U TIJEKU" | "ZAVRŠEN";
  hitni_rok: string | null;
  status_sirovine: StatusSirovine;
  split_group_id: string | null;
  split_label: "A" | "B" | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ScheduleStatus =
  | "OK"
  | "GREŠKA UNOSA"
  | "NEMA RASPOREDA"
  | "ČEKA PRIPREMU"
  | "ZAKAZANO"
  | "PREKLAPANJE"
  | "NEPROVJERENO"
  | "NEMA SIROVINE"
  | "ČEKANJE SIROVINE";

export type DeadlineStatus = "KASNI" | "KRITIČNO" | "NA VRIJEME" | "ROK ISTEKAO" | "BEZ ROKA" | null;

export interface ScheduledOrder {
  order: WorkOrder;
  start: Date | null;
  end: Date | null;
  status: ScheduleStatus;
  stanje: DeadlineStatus;
  overlapCount: number;
}

export interface ScheduleResult {
  scheduled: ScheduledOrder[];
  byMachine: Map<string, ScheduledOrder[]>;
}

export type NewWorkOrder = Omit<
  WorkOrder,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export interface MachineOverride {
  id: string;
  user_id: string;
  machine_id: string;
  date: string;       // ISO date "2026-03-21"
  work_start: string; // "07:00"
  work_end: string;   // "19:00"
  created_at: string;
}

// Overtime suggestion types
export type OvertimeShiftType = "weekday_evening" | "weekend_full";

export interface OvertimeSuggestion {
  machine_id: string;
  machine_name: string;
  date: string;              // ISO "2026-03-21"
  shift_type: OvertimeShiftType;
  work_start: string;        // "15:00" ili "07:00"
  work_end: string;          // "22:00" ili "15:00"
  hours_gained: number;      // 7 ili 8
  orders_fixed: string[];    // rn_id-ovi koji postaju NA VRIJEME
  score: number;
}

export interface OvertimeSuggestionResult {
  suggestions: OvertimeSuggestion[];
  total_late: number;
  total_critical: number;
  fixable_count: number;
  total_overtime_hours: number;
}

export type UserRole = "admin" | "material" | "viewer" | "tehnicka_priprema";

export interface UserProfile {
  id: string;
  role: UserRole;
  created_at: string;
}

/** Prijedlog prekovremenog rada za rješavanje kašnjenja. */
export interface OvertimeSuggestion {
  machine_id: string;
  machine_name: string;
  date: string;       // ISO date "2026-03-21"
  work_start: string; // "07:00"
  work_end: string;   // "19:00"
  extra_hours: number; // koliko sati se dobije prekovremenim
  affected_orders: number; // broj naloga koji kasne na taj stroj/dan
}

export interface OvertimeResult {
  fixable_count: number;
  suggestions: OvertimeSuggestion[];
}

/** Radno vrijeme za određeni stroj na određeni dan. null = neradni dan. */
export interface WorkingHours {
  start: number; // 7
  end: number;   // 19
  hours: number; // 12
}
