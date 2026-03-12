export interface Machine {
  id: string;
  user_id: string;
  name: string;
  color: string;
  color_light: string;
  sort_order: number;
  created_at: string;
}

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
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ScheduleStatus =
  | "OK"
  | "GREŠKA UNOSA"
  | "NEMA RASPOREDA"
  | "PREKLAPANJE";

export type DeadlineStatus = "KASNI" | "KRITIČNO" | "NA VRIJEME" | null;

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
