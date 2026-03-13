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

export type UserRole = "admin" | "material" | "viewer";

export interface UserProfile {
  id: string;
  role: UserRole;
  created_at: string;
}

/** Radno vrijeme za određeni stroj na određeni dan. null = neradni dan. */
export interface WorkingHours {
  start: number; // 7
  end: number;   // 19
  hours: number; // 12
}
