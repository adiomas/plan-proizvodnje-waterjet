import { Font, StyleSheet } from "@react-pdf/renderer";

Font.register({
  family: "Roboto",
  fonts: [
    { src: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/fonts/Roboto/Roboto-Regular.ttf" },
    { src: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/fonts/Roboto/Roboto-Medium.ttf", fontWeight: 700 },
  ],
});

/** A4 landscape s 15mm marginama */
export const PAGE_PROPS = {
  size: "A4" as const,
  orientation: "landscape" as const,
  style: {
    padding: "15mm",
    fontFamily: "Roboto",
    fontSize: 9,
    color: "#000",
    lineHeight: 1.4,
  },
};

export const s = StyleSheet.create({
  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontFamily: "Roboto",
    fontWeight: 700,
    letterSpacing: 0.8,
  },
  generated: {
    fontSize: 8,
    color: "#666",
  },

  // Meta info bar
  metaBar: {
    flexDirection: "row",
    borderTopWidth: 2,
    borderTopColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingVertical: 4,
    marginBottom: 8,
    gap: 16,
  },
  metaText: {
    fontSize: 9,
    fontFamily: "Roboto",
    fontWeight: 700,
  },
  metaRight: {
    fontSize: 9,
    fontFamily: "Roboto",
    fontWeight: 700,
    marginLeft: "auto",
  },

  // Table
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: "#000",
    paddingBottom: 3,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    paddingVertical: 3,
    minHeight: 16,
  },
  tableRowHighlight: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    paddingVertical: 3,
    minHeight: 16,
    backgroundColor: "#f5f0e8",
  },
  th: {
    fontSize: 7.5,
    fontFamily: "Roboto",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  td: {
    fontSize: 8.5,
  },
  tdBold: {
    fontSize: 8.5,
    fontFamily: "Roboto",
    fontWeight: 700,
  },

  // Day section (weekly)
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eee",
    borderLeftWidth: 3,
    borderLeftColor: "#000",
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginTop: 6,
    marginBottom: 2,
  },
  dayTitle: {
    fontSize: 9,
    fontFamily: "Roboto",
    fontWeight: 700,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: "15mm",
    left: "15mm",
    right: "15mm",
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#999",
    paddingTop: 4,
  },
  footerText: {
    fontSize: 7,
    color: "#888",
  },

  // Empty state
  emptyState: {
    textAlign: "center",
    fontSize: 10,
    color: "#888",
    marginTop: 40,
  },
});

// Column widths for daily report (% based)
export const DAILY_COLS = {
  num: "4%",
  rnId: "8%",
  opis: "24%",
  napomena: "22%",
  trajanje: "6%",
  pocetak: "8%",
  kraj: "8%",
  rok: "8%",
  status: "8%",
  stanje: "8%",
} as const;

// Column widths for weekly report (compact)
export const WEEKLY_COLS = {
  rnId: "9%",
  opis: "32%",
  napomena: "20%",
  trajanje: "7%",
  vrijeme: "14%",
  rok: "9%",
  stanje: "9%",
} as const;
