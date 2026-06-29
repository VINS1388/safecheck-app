import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { COLORS, ESITO_LABEL, ESITO_COLOR } from "./styles";
import { PdfHeader } from "./Header";
import { PdfFooter } from "./Footer";
import type { DatiVerbale, SezionePDF } from "@/types/verbale";

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
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primary,
    borderBottomStyle: "solid",
    paddingBottom: 4,
  },
  sectionHeader: {
    backgroundColor: COLORS.primary,
    padding: 5,
    marginTop: 10,
    marginBottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionHeaderText: {
    color: COLORS.white,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  sectionHeaderCount: {
    color: "#bbccdd",
    fontSize: 7,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.bgHeader,
    padding: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
    padding: 3,
    minHeight: 18,
  },
  tableRowAlt: { backgroundColor: COLORS.bgAlt },
  tableRowNC: { backgroundColor: COLORS.bgNC },
  tableRowPC: { backgroundColor: COLORS.bgPC },
  num: { width: 18, fontSize: 7, color: COLORS.muted, textAlign: "center" },
  domanda: { flex: 3, fontSize: 7.5, paddingHorizontal: 3 },
  esito: { width: 55, fontSize: 7, textAlign: "center", paddingHorizontal: 2 },
  azione: { flex: 2, fontSize: 7, paddingHorizontal: 3 },
  oss: { flex: 2, fontSize: 7, paddingHorizontal: 3, color: COLORS.muted },
  cellHeader: {
    fontSize: 7,
    color: COLORS.primary,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 3,
  },
});

function SezioneBlock({ sez }: { sez: SezionePDF }) {
  const countStr = `C:${sez.conteggi.C} PC:${sez.conteggi.PC} NC:${sez.conteggi.NC} NV:${sez.conteggi.NV} NA:${sez.conteggi.NA}`;
  return (
    <View wrap={false}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionHeaderText}>{sez.nome}</Text>
        <Text style={s.sectionHeaderCount}>{countStr}</Text>
      </View>
      {/* intestazione colonne */}
      <View style={s.tableHeader}>
        <Text style={[s.num, s.cellHeader]}>#</Text>
        <Text style={[s.domanda, s.cellHeader]}>Punto di verifica</Text>
        <Text style={[s.esito, s.cellHeader]}>Esito</Text>
        <Text style={[s.azione, s.cellHeader]}>Azione correttiva</Text>
        <Text style={[s.oss, s.cellHeader]}>Osservazioni</Text>
      </View>
      {sez.risposte.map((r, i) => {
        const rowStyle =
          r.esito === "NC"
            ? s.tableRowNC
            : r.esito === "PC"
            ? s.tableRowPC
            : i % 2 === 1
            ? s.tableRowAlt
            : {};
        const ossText = r.nominativi
          ? (r.osservazioni ? r.osservazioni + "\n" : "") +
            "Nominativo/i: " +
            r.nominativi
          : r.osservazioni;
        return (
          <View key={r.domanda_id} style={[s.tableRow, rowStyle]}>
            <Text style={s.num}>{i + 1}</Text>
            <Text style={s.domanda}>{r.testo_domanda}</Text>
            <Text
              style={[
                s.esito,
                {
                  color: r.esito ? ESITO_COLOR[r.esito] : COLORS.muted,
                  fontFamily: "Helvetica-Bold",
                },
              ]}
            >
              {r.esito ? ESITO_LABEL[r.esito] : "—"}
            </Text>
            <Text style={s.azione}>{r.azione_correttiva}</Text>
            <Text style={s.oss}>{ossText}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function PaginaDettaglio({ dati }: { dati: DatiVerbale }) {
  return (
    <Page size="A4" style={s.page}>
      <PdfHeader dati={dati} />
      <Text style={s.pageTitle}>DETTAGLIO SEZIONI</Text>
      {dati.sezioni.map((sez) => (
        <SezioneBlock key={sez.id} sez={sez} />
      ))}
      <PdfFooter dati={dati} />
    </Page>
  );
}
