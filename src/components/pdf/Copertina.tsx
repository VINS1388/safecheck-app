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
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primary,
    textAlign: "center",
    marginTop: 30,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.muted,
    textAlign: "center",
    marginBottom: 30,
  },
  table: {
    marginTop: 10,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderStyle: "solid",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
  },
  labelCell: {
    width: "35%",
    backgroundColor: COLORS.bgHeader,
    padding: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  valueCell: {
    width: "65%",
    padding: 6,
    fontSize: 9,
  },
});

export function PaginaCopertina({ dati }: { dati: DatiVerbale }) {
  const rows: [string, string][] = [
    ["Azienda", dati.cliente],
    ["Sede", dati.sede],
    ["Indirizzo", dati.indirizzo],
    ["Data intervento", dati.data_visita],
    ["Specialist", `${dati.tecnico} — ${dati.qualifica}`],
    ["Persona presente", dati.referente_cliente],
    ["N° verbale", dati.numero_verbale],
    ["Ora inizio", dati.ora_inizio],
  ];

  return (
    <Page size="A4" style={s.page}>
      <PdfHeader dati={dati} />
      <Text style={s.title}>VERBALE DI INTERVENTO</Text>
      <Text style={s.subtitle}>Sicurezza sul Lavoro — D.Lgs. 81/2008</Text>
      <View style={s.table}>
        {rows.map(([label, value]) => (
          <View key={label} style={s.row}>
            <Text style={s.labelCell}>{label}</Text>
            <Text style={s.valueCell}>{value}</Text>
          </View>
        ))}
      </View>
      <PdfFooter dati={dati} />
    </Page>
  );
}
