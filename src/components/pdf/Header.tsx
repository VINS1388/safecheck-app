import { View, Text } from "@react-pdf/renderer";
import { styles } from "./styles";
import type { DatiVerbale } from "@/types/verbale";

export function PdfHeader({ dati }: { dati: DatiVerbale }) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerLeft}>
        <Text style={styles.headerText}>SafeCheck</Text>
        <Text style={styles.headerTextSmall}>
          Verbale di Sopralluogo — Sicurezza sul Lavoro
        </Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerTextSmall}>N° {dati.numero_verbale}</Text>
        <Text style={styles.headerTextSmall}>Data: {dati.data_visita}</Text>
        <Text style={styles.headerTextSmall}>Tecnico: {dati.tecnico}</Text>
      </View>
    </View>
  );
}
