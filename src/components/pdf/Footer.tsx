import { View, Text } from "@react-pdf/renderer";
import { styles } from "./styles";
import type { DatiVerbale } from "@/types/verbale";

export function PdfFooter({ dati }: { dati: DatiVerbale }) {
  return (
    <View style={styles.footer} fixed>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) =>
          `SafeCheck — ${dati.cliente} — ${dati.sede} | ` +
          `N° ${dati.numero_verbale} | Pag. ${pageNumber} di ${totalPages} | ` +
          `Gen: ${dati.data_generazione}`
        }
      />
    </View>
  );
}
