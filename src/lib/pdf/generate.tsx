import { pdf } from "@react-pdf/renderer";
import type { Machine, MachineOverride, ScheduledOrder } from "../types";
import { formatDate, weekNumber } from "./utils";
import { DailyReport } from "./daily-report";
import { WeeklyReport } from "./weekly-report";

export { getMonday } from "./utils";

/** Generiraj dnevni PDF i pokreni download */
export async function downloadDailyPDF(
  machine: Machine | null,
  machines: Machine[],
  orders: ScheduledOrder[],
  date: Date,
  overrides: MachineOverride[] = [],
  sirovineEnabled = false
): Promise<void> {
  const blob = await pdf(
    <DailyReport machine={machine} machines={machines} orders={orders} date={date} overrides={overrides} sirovineEnabled={sirovineEnabled} />
  ).toBlob();
  const machineName = machine ? machine.name : "Svi-strojevi";
  const dateStr = formatDate(date).replace(/\./g, "-").slice(0, -1);
  triggerDownload(blob, `Dnevni-plan_${machineName}_${dateStr}.pdf`);
}

/** Generiraj tjedni PDF i pokreni download */
export async function downloadWeeklyPDF(
  machine: Machine | null,
  machines: Machine[],
  orders: ScheduledOrder[],
  weekStart: Date,
  overrides: MachineOverride[] = [],
  sirovineEnabled = false
): Promise<void> {
  const blob = await pdf(
    <WeeklyReport machine={machine} machines={machines} orders={orders} weekStart={weekStart} overrides={overrides} sirovineEnabled={sirovineEnabled} />
  ).toBlob();
  const machineName = machine ? machine.name : "Svi-strojevi";
  const weekStr = `T${weekNumber(weekStart)}`;
  triggerDownload(blob, `Tjedni-plan_${machineName}_${weekStr}.pdf`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
