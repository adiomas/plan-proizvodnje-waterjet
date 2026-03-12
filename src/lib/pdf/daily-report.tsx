import { Document, Page, View, Text } from "@react-pdf/renderer";
import type { Machine, MachineOverride, ScheduledOrder } from "../types";
import { HOURS_PER_DAY, getWorkingHours } from "../utils";
import { PAGE_PROPS, s, DAILY_COLS } from "./styles";
import {
  getOrdersForDate,
  splitOrderByDay,
  formatDate,
  formatTimePDF,
  formatRokShort,
  dayNameFull,
  toLocalDateKey,
  type DaySegment,
} from "./utils";

interface Props {
  machine: Machine | null; // null = svi strojevi
  machines: Machine[];
  orders: ScheduledOrder[];
  date: Date;
  overrides: MachineOverride[];
}

export function DailyReport({ machine, machines, orders, date, overrides }: Props) {
  const targetMachines = machine ? [machine] : machines;

  return (
    <Document>
      {targetMachines.map((m) => (
        <DailyPage
          key={m.id}
          machine={m}
          orders={orders}
          date={date}
          overrides={overrides}
        />
      ))}
    </Document>
  );
}

function DailyPage({
  machine,
  orders,
  date,
  overrides,
}: {
  machine: Machine;
  orders: ScheduledOrder[];
  date: Date;
  overrides: MachineOverride[];
}) {
  const dayOrders = getOrdersForDate(orders, date, machine.id);

  // Kreiraj segmente za ovaj dan
  const segments: DaySegment[] = [];
  for (const order of dayOrders) {
    const orderSegments = splitOrderByDay(order);
    const todaySegment = orderSegments.find((seg) => {
      return toLocalDateKey(seg.dayStart) === toLocalDateKey(date);
    });
    if (todaySegment) segments.push(todaySegment);
  }
  segments.sort((a, b) => a.dayStart.getTime() - b.dayStart.getTime());

  const totalH = Math.round(segments.reduce((sum, seg) => sum + seg.hours, 0) * 10) / 10;

  // Dohvati radno vrijeme za taj dan
  const wh = getWorkingHours(machine.id, date, overrides);
  const workHours = wh ? wh.hours : HOURS_PER_DAY;
  const workStart = wh ? `${String(Math.floor(wh.start)).padStart(2, "0")}:${String(Math.round((wh.start % 1) * 60)).padStart(2, "0")}` : "07:00";
  const workEnd = wh ? `${String(Math.floor(wh.end)).padStart(2, "0")}:${String(Math.round((wh.end % 1) * 60)).padStart(2, "0")}` : "15:00";

  const util = workHours > 0 ? Math.round((totalH / workHours) * 1000) / 10 : 0;
  const now = new Date();

  return (
    <Page {...PAGE_PROPS}>
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={s.title}>DNEVNI PLAN PROIZVODNJE</Text>
        <Text style={s.generated}>Generirano: {formatDate(now)} {formatTimePDF(now)}</Text>
      </View>

      {/* Meta */}
      <View style={s.metaBar}>
        <Text style={s.metaText}>STROJ: {machine.name.toUpperCase()}</Text>
        <Text style={s.metaText}>
          DATUM: {dayNameFull(date)}, {formatDate(date)}
        </Text>
        <Text style={s.metaText}>SMJENA: {workStart} — {workEnd}</Text>
        <Text style={s.metaRight}>
          NALOGA: {segments.length} | SATI: {totalH}h / {workHours}h ({util}%)
        </Text>
      </View>

      {segments.length === 0 ? (
        <Text style={s.emptyState}>Nema zakazanih naloga za ovaj dan.</Text>
      ) : (
        <View>
          {/* Table header */}
          <View style={s.tableHeader}>
            <Text style={[s.th, { width: DAILY_COLS.num }]}>#</Text>
            <Text style={[s.th, { width: DAILY_COLS.rnId }]}>RN ID</Text>
            <Text style={[s.th, { width: DAILY_COLS.opis }]}>OPIS</Text>
            <Text style={[s.th, { width: DAILY_COLS.napomena }]}>NAPOMENA</Text>
            <Text style={[s.th, { width: DAILY_COLS.trajanje, textAlign: "center" }]}>TRAJ.</Text>
            <Text style={[s.th, { width: DAILY_COLS.pocetak, textAlign: "center" }]}>POČETAK</Text>
            <Text style={[s.th, { width: DAILY_COLS.kraj, textAlign: "center" }]}>KRAJ</Text>
            <Text style={[s.th, { width: DAILY_COLS.rok, textAlign: "center" }]}>ROK</Text>
            <Text style={[s.th, { width: DAILY_COLS.status, textAlign: "center" }]}>STATUS</Text>
            <Text style={[s.th, { width: DAILY_COLS.stanje, textAlign: "center" }]}>STANJE</Text>
          </View>

          {/* Table rows */}
          {segments.map((seg, i) => {
            const isCritical =
              seg.order.stanje === "KRITIČNO" || seg.order.stanje === "KASNI";
            const rowStyle = isCritical ? s.tableRowHighlight : s.tableRow;
            const cellStyle = isCritical ? s.tdBold : s.td;

            return (
              <View key={`${seg.order.order.id}-${i}`} style={rowStyle} wrap={false}>
                <Text style={[s.td, { width: DAILY_COLS.num }]}>{i + 1}</Text>
                <Text style={[s.tdBold, { width: DAILY_COLS.rnId }]}>
                  {seg.order.order.rn_id}
                  {seg.isContinuation ? " *" : ""}
                </Text>
                <Text style={[s.td, { width: DAILY_COLS.opis }]}>
                  {seg.order.order.opis || "—"}
                </Text>
                <Text style={[s.td, { width: DAILY_COLS.napomena, color: "#444" }]}>
                  {seg.order.order.napomena || "—"}
                </Text>
                <Text style={[s.td, { width: DAILY_COLS.trajanje, textAlign: "center" }]}>
                  {seg.hours}h
                </Text>
                <Text style={[s.tdBold, { width: DAILY_COLS.pocetak, textAlign: "center" }]}>
                  {formatTimePDF(seg.dayStart)}
                </Text>
                <Text style={[s.tdBold, { width: DAILY_COLS.kraj, textAlign: "center" }]}>
                  {formatTimePDF(seg.dayEnd)}
                </Text>
                <Text style={[cellStyle, { width: DAILY_COLS.rok, textAlign: "center" }]}>
                  {seg.order.order.rok_isporuke
                    ? formatRokShort(seg.order.order.rok_isporuke)
                    : "—"}
                </Text>
                <Text style={[s.td, { width: DAILY_COLS.status, textAlign: "center" }]}>
                  {seg.order.status}
                </Text>
                <Text style={[
                  seg.order.stanje === "BEZ ROKA" ? s.tdMuted : cellStyle,
                  { width: DAILY_COLS.stanje, textAlign: "center" }
                ]}>
                  {seg.order.stanje || "—"}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Legenda za nastavak */}
      {segments.some((seg) => seg.isContinuation) && (
        <Text style={{ fontSize: 7, color: "#888", marginTop: 6 }}>
          * nastavak naloga s prethodnog dana
        </Text>
      )}

      {/* Footer */}
      <View style={s.footer} fixed>
        <Text style={s.footerText}>Plan Proizvodnje — Waterjet</Text>
        <Text
          style={s.footerText}
          render={({ pageNumber, totalPages }) => `Str. ${pageNumber}/${totalPages}`}
        />
      </View>
    </Page>
  );
}

