import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { COLORS } from "./styles";
import { PdfHeader } from "./Header";
import { PdfFooter } from "./Footer";
import type { DatiVerbale } from "@/types/verbale";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COLORS.text,
    paddingTop: 80,
    paddingBottom: 50,
    paddingHorizontal: 28,
  },
  pageTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primary,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primary,
    borderBottomStyle: "solid",
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    marginTop: 40,
  },
  col: { flex: 1, paddingHorizontal: 10 },
  label: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primary,
    marginBottom: 4,
  },
  name: { fontSize: 9, marginBottom: 20 },
  firmaBox: {
    height: 40,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderStyle: "solid",
    borderRadius: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  firmaPlaceholder: {
    fontSize: 8,
    color: "#aaaaaa",
    fontFamily: "Helvetica-Oblique",
  },
  dataRow: {
    flexDirection: "row",
    marginTop: 8,
    alignItems: "center",
  },
  dataLabel: { fontSize: 8, color: COLORS.muted, marginRight: 6 },
  dataLine: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
    height: 12,
  },
  disclaimer: {
    marginTop: 40,
    padding: 8,
    backgroundColor: COLORS.bgAlt,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderStyle: "solid",
  },
  disclaimerText: {
    fontSize: 7,
    color: COLORS.muted,
    textAlign: "center",
  },
});

export function PaginaFirme({ dati }: { dati: DatiVerbale }) {
  return (
    <Page size="A4" style={s.page}>
      <PdfHeader dati={dati} />
      <Text style={s.pageTitle}>FIRME</Text>
      <View style={s.row}>
        <View style={s.col}>
          <Text style={s.label}>Specialist SafeCheck</Text>
          <Text style={s.name}>{dati.tecnico}</Text>
          <View style={s.firmaBox}>
            <Text style={s.firmaPlaceholder}>Firma</Text>
          </View>
          <View style={s.dataRow}>
            <Text style={s.dataLabel}>Data:</Text>
            <View style={s.dataLine} />
          </View>
        </View>
        <View style={s.col}>
          <Text style={s.label}>Cliente / Referente</Text>
          <Text style={s.name}>{dati.referente_cliente}</Text>
          <View style={s.firmaBox}>
            <Text style={s.firmaPlaceholder}>Firma</Text>
          </View>
          <View style={s.dataRow}>
            <Text style={s.dataLabel}>Data:</Text>
            <View style={s.dataLine} />
          </View>
        </View>
      </View>
      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>
          Il presente verbale è stato redatto dal tecnico incaricato ed è valido
          come documento di consulenza ai sensi del D.Lgs. 81/2008. Non
          sostituisce il Documento di Valutazione dei Rischi.
        </Text>
      </View>
      <PdfFooter dati={dati} />
    </Page>
  );
}
