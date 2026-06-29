import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { COLORS, ESITO_LABEL, ESITO_COLOR } from "./styles";
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
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primary,
    borderBottomStyle: "solid",
    paddingBottom: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    padding: 4,
    marginTop: 12,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
    padding: 4,
  },
  tableRowAlt: { backgroundColor: COLORS.bgAlt },
  cell: { fontSize: 7.5, paddingHorizontal: 3 },
  cellHeader: {
    fontSize: 7.5,
    color: COLORS.white,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 3,
  },
});

export function PaginaRiepilogo({ dati }: { dati: DatiVerbale }) {
  const { totali, sezioni } = dati;

  return (
    <Page size="A4" style={s.page}>
      <PdfHeader dati={dati} />
      <Text style={s.pageTitle}>RIEPILOGO ESECUTIVO</Text>

      {/* Tabella esiti globali */}
      <View style={s.tableHeader}>
        {["Esito", "Conteggio", "% sul verificato"].map((h) => (
          <Text key={h} style={[s.cellHeader, { flex: h === "Esito" ? 2 : 1 }]}>
            {h}
          </Text>
        ))}
      </View>
      {(["C", "PC", "NC", "NV"] as const).map((esito, i) => (
        <View key={esito} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
          <Text style={[s.cell, { flex: 2, color: ESITO_COLOR[esito] }]}>
            {ESITO_LABEL[esito]}
          </Text>
          <Text style={[s.cell, { flex: 1 }]}>{totali[esito]}</Text>
          <Text style={[s.cell, { flex: 1 }]}>
            {totali.verificati > 0
              ? ((totali[esito] / totali.verificati) * 100).toFixed(1) + "%"
              : "—"}
          </Text>
        </View>
      ))}
      <View style={s.tableRow}>
        <Text style={[s.cell, { flex: 2, color: COLORS.nonApplicabile }]}>
          {ESITO_LABEL["NA"]}
        </Text>
        <Text style={[s.cell, { flex: 1 }]}>{totali.NA}</Text>
        <Text style={[s.cell, { flex: 1, color: COLORS.muted }]}>
          escluso dal calcolo
        </Text>
      </View>

      {/* Conteggi per sezione */}
      <Text style={[s.pageTitle, { marginTop: 16, fontSize: 10 }]}>
        Conteggi per sezione
      </Text>
      <View style={s.tableHeader}>
        {["Sezione", "C", "PC", "NC", "NV", "NA", "Tot"].map((h) => (
          <Text
            key={h}
            style={[
              s.cellHeader,
              { flex: h === "Sezione" ? 4 : 1, textAlign: "center" },
            ]}
          >
            {h}
          </Text>
        ))}
      </View>
      {sezioni.map((sez, i) => (
        <View key={sez.id} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
          <Text style={[s.cell, { flex: 4 }]}>{sez.nome}</Text>
          {(["C", "PC", "NC", "NV", "NA"] as const).map((e) => (
            <Text key={e} style={[s.cell, { flex: 1, textAlign: "center" }]}>
              {sez.conteggi[e]}
            </Text>
          ))}
          <Text style={[s.cell, { flex: 1, textAlign: "center" }]}>
            {Object.values(sez.conteggi).reduce((a, b) => a + b, 0)}
          </Text>
        </View>
      ))}
      <PdfFooter dati={dati} />
    </Page>
  );
}
