import { Document, Page, View, Text } from "@react-pdf/renderer";
import { addDays } from "date-fns";
import type { Machine, MachineOverride, ScheduledOrder } from "../types";
import { getWorkingHours } from "../utils";
import { PAGE_PROPS, s, WEEKLY_COLS } from "./styles";
import {
  getWeekSegments,
  formatDate,
  formatDateShort,
  formatTimePDF,
  formatRokShort,
  dayNameFull,
  weekNumber,
  type DaySegment,
} from "./utils";

interface Props {
  machine: Machine | null; // null = svi strojevi
  machines: Machine[];
  orders: ScheduledOrder[];
  weekStart: Date; // ponedjeljak
  overrides: MachineOverride[];
}

export function WeeklyReport({ machine, machines, orders, weekStart, overrides }: Props) {
  const targetMachines = machine ? [machine] : machines;

  return (
    <Document>
      {targetMachines.map((m) => (
        <WeeklyPage
          key={m.id}
          machine={m}
          orders={orders}
          weekStart={weekStart}
          overrides={overrides}
        />
      ))}
    </Document>
  );
}

function WeeklyPage({
  machine,
  orders,
  weekStart,
  overrides,
}: {
  machine: Machine;
  orders: ScheduledOrder[];
  weekStart: Date;
  overrides: MachineOverride[];
}) {
  const weekEnd = addDays(weekStart, 4); // petak
  const daySegments = getWeekSegments(orders, weekStart, machine.id, overrides);
  const now = new Date();

  // Izračunaj sumarizaciju
  let totalOrders = 0;
  let totalH = 0;
  const uniqueOrderIds = new Set<string>();
  for (const [, segments] of daySegments) {
    for (const seg of segments) {
      totalH += seg.hours;
      uniqueOrderIds.add(seg.order.order.id);
    }
  }
  totalOrders = uniqueOrderIds.size;
  totalH = Math.round(totalH * 10) / 10;

  // Izračunaj kapacitet na osnovu stvarnog radnog vremena (uključujući overridee)
  let capacity = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const wh = getWorkingHours(machine.id, day, overrides);
    if (wh) capacity += wh.hours;
  }
  const util = capacity > 0 ? Math.round((totalH / capacity) * 1000) / 10 : 0;

  const hasAnyOrders = totalOrders > 0;

  return (
    <Page {...PAGE_PROPS}>
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={s.title}>TJEDNI PLAN PROIZVODNJE</Text>
        <Text style={s.generated}>Generirano: {formatDate(now)} {formatTimePDF(now)}</Text>
      </View>

      {/* Meta */}
      <View style={s.metaBar}>
        <Text style={s.metaText}>STROJ: {machine.name.toUpperCase()}</Text>
        <Text style={s.metaText}>
          TJEDAN: {weekNumber(weekStart)} ({formatDateShort(weekStart)} — {formatDate(weekEnd)})
        </Text>
        <Text style={s.metaRight}>
          NALOGA: {totalOrders} | SATI: {totalH}h / {capacity}h ({util}%)
        </Text>
      </View>

      {!hasAnyOrders ? (
        <Text style={s.emptyState}>Nema zakazanih naloga za ovaj tjedan.</Text>
      ) : (
        <View>
          {Array.from(daySegments.entries()).map(([dateKey, segments]) => {
            const dayDate = new Date(dateKey + "T00:00:00");
            return (
              <DaySection
                key={dateKey}
                date={dayDate}
                segments={segments}
              />
            );
          })}
        </View>
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

function DaySection({
  date,
  segments,
}: {
  date: Date;
  segments: DaySegment[];
}) {
  return (
    <View wrap={false}>
      {/* Day header */}
      <View style={s.dayHeader}>
        <Text style={s.dayTitle}>
          {dayNameFull(date)}, {formatDateShort(date)}
        </Text>
        {segments.length === 0 && (
          <Text style={{ fontSize: 8, color: "#888", marginLeft: 12 }}>
            — nema naloga
          </Text>
        )}
      </View>

      {segments.length > 0 && (
        <View>
          {/* Column headers for day */}
          <View style={[s.tableHeader, { borderBottomWidth: 0.5, marginBottom: 0 }]}>
            <Text style={[s.th, { width: WEEKLY_COLS.rnId }]}>RN ID</Text>
            <Text style={[s.th, { width: WEEKLY_COLS.opis }]}>OPIS</Text>
            <Text style={[s.th, { width: WEEKLY_COLS.napomena }]}>NAPOMENA</Text>
            <Text style={[s.th, { width: WEEKLY_COLS.trajanje, textAlign: "center" }]}>TRAJ.</Text>
            <Text style={[s.th, { width: WEEKLY_COLS.vrijeme, textAlign: "center" }]}>VRIJEME</Text>
            <Text style={[s.th, { width: WEEKLY_COLS.rok, textAlign: "center" }]}>ROK</Text>
            <Text style={[s.th, { width: WEEKLY_COLS.stanje, textAlign: "center" }]}>STANJE</Text>
          </View>

          {segments.map((seg, i) => {
            const isCritical =
              seg.order.stanje === "KRITIČNO" || seg.order.stanje === "KASNI";
            const rowStyle = isCritical ? s.tableRowHighlight : s.tableRow;
            const cellStyle = isCritical ? s.tdBold : s.td;

            return (
              <View key={`${seg.order.order.id}-${i}`} style={rowStyle}>
                <Text style={[s.tdBold, { width: WEEKLY_COLS.rnId }]}>
                  {seg.order.order.rn_id}
                </Text>
                <Text style={[s.td, { width: WEEKLY_COLS.opis }]}>
                  {seg.order.order.opis || "—"}
                  {seg.isContinuation ? " (nastavak)" : ""}
                </Text>
                <Text style={[s.td, { width: WEEKLY_COLS.napomena, color: "#444" }]}>
                  {seg.order.order.napomena || "—"}
                </Text>
                <Text style={[s.td, { width: WEEKLY_COLS.trajanje, textAlign: "center" }]}>
                  {seg.hours}h
                </Text>
                <Text style={[s.tdBold, { width: WEEKLY_COLS.vrijeme, textAlign: "center" }]}>
                  {formatTimePDF(seg.dayStart)}—{formatTimePDF(seg.dayEnd)}
                </Text>
                <Text style={[cellStyle, { width: WEEKLY_COLS.rok, textAlign: "center" }]}>
                  {seg.order.order.rok_isporuke
                    ? formatRokShort(seg.order.order.rok_isporuke)
                    : "—"}
                </Text>
                <Text style={[
                  seg.order.stanje === "BEZ ROKA" ? s.tdMuted : cellStyle,
                  { width: WEEKLY_COLS.stanje, textAlign: "center" }
                ]}>
                  {seg.order.stanje || "—"}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

