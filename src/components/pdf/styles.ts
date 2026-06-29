import { StyleSheet } from "@react-pdf/renderer";

export const COLORS = {
  primary: "#1e3a5f",
  white: "#ffffff",
  text: "#1a1a1a",
  muted: "#555555",
  border: "#cccccc",
  conforme: "#2e7d32",
  parziale: "#f57c00",
  nonConforme: "#c62828",
  nonVerificabile: "#6a1b9a",
  nonApplicabile: "#757575",
  bgNC: "#ffebee",
  bgPC: "#fff3e0",
  bgAlt: "#f9f9f9",
  bgHeader: "#f0f4f8",
};

export const ESITO_LABEL: Record<string, string> = {
  C: "Conforme",
  PC: "Parz. Conforme",
  NC: "Non Conforme",
  NV: "Non Verificabile",
  NA: "Non Applicabile",
};

export const ESITO_COLOR: Record<string, string> = {
  C: COLORS.conforme,
  PC: COLORS.parziale,
  NC: COLORS.nonConforme,
  NV: COLORS.nonVerificabile,
  NA: COLORS.nonApplicabile,
};

export const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COLORS.text,
    paddingTop: 80,
    paddingBottom: 50,
    paddingHorizontal: 28,
  },
  // Header fisso su ogni pagina
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    flexDirection: "row",
  },
  headerLeft: {
    width: "50%",
    backgroundColor: COLORS.primary,
    padding: 10,
    justifyContent: "center",
  },
  headerRight: {
    width: "50%",
    backgroundColor: COLORS.primary,
    padding: 10,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  headerText: {
    color: COLORS.white,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  headerTextSmall: {
    color: COLORS.white,
    fontSize: 7,
    marginTop: 2,
  },
  // Footer fisso su ogni pagina
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
    borderTopStyle: "solid",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  footerText: {
    fontSize: 7,
    color: "#888888",
  },
  // Titoli sezione
  sectionTitle: {
    backgroundColor: COLORS.primary,
    padding: 6,
    marginBottom: 6,
    marginTop: 12,
  },
  sectionTitleText: {
    color: COLORS.white,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  // Tabelle
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    padding: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
    padding: 4,
    minHeight: 20,
  },
  tableRowAlt: {
    backgroundColor: COLORS.bgAlt,
  },
  tableCell: {
    fontSize: 7.5,
    paddingHorizontal: 3,
  },
  tableCellHeader: {
    fontSize: 7.5,
    color: COLORS.white,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 3,
  },
});
