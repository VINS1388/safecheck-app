/**
 * Tipi TypeScript del database SafeCheck.
 *
 * ⚠️ Generato manualmente da supabase/migrations/001_schema_iniziale.sql
 *    in attesa del push reale su Supabase. Dopo `supabase db push`
 *    RIGENERARE da fonte di verità con:
 *
 *      supabase gen types typescript --project-id yrgpowaflmcwwspffjip \
 *        --schema public > src/types/database.types.ts
 *
 *    Mantiene la stessa forma dell'output del CLI (Database / Tables / Enums).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      utenti: {
        Row: {
          id: string;
          email: string;
          nome_completo: string;
          ruolo: Database["public"]["Enums"]["ruolo_utente"];
          telefono: string | null;
          qualifica: string | null;
          attivo: boolean;
          creato_il: string;
          aggiornato_il: string;
        };
        Insert: {
          id: string;
          email: string;
          nome_completo: string;
          ruolo?: Database["public"]["Enums"]["ruolo_utente"];
          telefono?: string | null;
          qualifica?: string | null;
          attivo?: boolean;
          creato_il?: string;
          aggiornato_il?: string;
        };
        Update: {
          id?: string;
          email?: string;
          nome_completo?: string;
          ruolo?: Database["public"]["Enums"]["ruolo_utente"];
          telefono?: string | null;
          qualifica?: string | null;
          attivo?: boolean;
          creato_il?: string;
          aggiornato_il?: string;
        };
        Relationships: [];
      };
      clienti: {
        Row: {
          id: string;
          ragione_sociale: string;
          partita_iva: string | null;
          codice_fiscale: string | null;
          indirizzo_sede_legale: string | null;
          citta: string | null;
          cap: string | null;
          provincia: string | null;
          referente_principale: string | null;
          telefono_referente: string | null;
          email_referente: string | null;
          note: string | null;
          attivo: boolean;
          creato_da: string | null;
          creato_il: string;
          aggiornato_il: string;
        };
        Insert: {
          id?: string;
          ragione_sociale: string;
          partita_iva?: string | null;
          codice_fiscale?: string | null;
          indirizzo_sede_legale?: string | null;
          citta?: string | null;
          cap?: string | null;
          provincia?: string | null;
          referente_principale?: string | null;
          telefono_referente?: string | null;
          email_referente?: string | null;
          note?: string | null;
          attivo?: boolean;
          creato_da?: string | null;
          creato_il?: string;
          aggiornato_il?: string;
        };
        Update: {
          id?: string;
          ragione_sociale?: string;
          partita_iva?: string | null;
          codice_fiscale?: string | null;
          indirizzo_sede_legale?: string | null;
          citta?: string | null;
          cap?: string | null;
          provincia?: string | null;
          referente_principale?: string | null;
          telefono_referente?: string | null;
          email_referente?: string | null;
          note?: string | null;
          attivo?: boolean;
          creato_da?: string | null;
          creato_il?: string;
          aggiornato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clienti_creato_da_fkey";
            columns: ["creato_da"];
            referencedRelation: "utenti";
            referencedColumns: ["id"];
          }
        ];
      };
      sedi: {
        Row: {
          id: string;
          cliente_id: string;
          nome: string;
          indirizzo: string;
          citta: string;
          cap: string | null;
          provincia: string | null;
          referente_sede: string | null;
          telefono_referente: string | null;
          note: string | null;
          attiva: boolean;
          creato_il: string;
          aggiornato_il: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          nome: string;
          indirizzo: string;
          citta: string;
          cap?: string | null;
          provincia?: string | null;
          referente_sede?: string | null;
          telefono_referente?: string | null;
          note?: string | null;
          attiva?: boolean;
          creato_il?: string;
          aggiornato_il?: string;
        };
        Update: {
          id?: string;
          cliente_id?: string;
          nome?: string;
          indirizzo?: string;
          citta?: string;
          cap?: string | null;
          provincia?: string | null;
          referente_sede?: string | null;
          telefono_referente?: string | null;
          note?: string | null;
          attiva?: boolean;
          creato_il?: string;
          aggiornato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sedi_cliente_id_fkey";
            columns: ["cliente_id"];
            referencedRelation: "clienti";
            referencedColumns: ["id"];
          }
        ];
      };
      template_master: {
        Row: {
          id: string;
          nome: string;
          descrizione: string | null;
          versione: number;
          struttura_json: Json;
          attivo: boolean;
          creato_da: string | null;
          creato_il: string;
        };
        Insert: {
          id?: string;
          nome: string;
          descrizione?: string | null;
          versione?: number;
          struttura_json: Json;
          attivo?: boolean;
          creato_da?: string | null;
          creato_il?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          descrizione?: string | null;
          versione?: number;
          struttura_json?: Json;
          attivo?: boolean;
          creato_da?: string | null;
          creato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "template_master_creato_da_fkey";
            columns: ["creato_da"];
            referencedRelation: "utenti";
            referencedColumns: ["id"];
          }
        ];
      };
      template_cliente: {
        Row: {
          id: string;
          cliente_id: string;
          basato_su: string | null;
          versione: number;
          struttura_json: Json;
          modificato_da: string | null;
          modificato_il: string;
          creato_il: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          basato_su?: string | null;
          versione?: number;
          struttura_json: Json;
          modificato_da?: string | null;
          modificato_il?: string;
          creato_il?: string;
        };
        Update: {
          id?: string;
          cliente_id?: string;
          basato_su?: string | null;
          versione?: number;
          struttura_json?: Json;
          modificato_da?: string | null;
          modificato_il?: string;
          creato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "template_cliente_cliente_id_fkey";
            columns: ["cliente_id"];
            referencedRelation: "clienti";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "template_cliente_basato_su_fkey";
            columns: ["basato_su"];
            referencedRelation: "template_master";
            referencedColumns: ["id"];
          }
        ];
      };
      template_sede: {
        Row: {
          id: string;
          sede_id: string;
          cliente_id: string;
          basato_su: string | null;
          versione: number;
          struttura_json: Json;
          modificato_da: string | null;
          modificato_il: string;
          creato_il: string;
        };
        Insert: {
          id?: string;
          sede_id: string;
          cliente_id: string;
          basato_su?: string | null;
          versione?: number;
          struttura_json: Json;
          modificato_da?: string | null;
          modificato_il?: string;
          creato_il?: string;
        };
        Update: {
          id?: string;
          sede_id?: string;
          cliente_id?: string;
          basato_su?: string | null;
          versione?: number;
          struttura_json?: Json;
          modificato_da?: string | null;
          modificato_il?: string;
          creato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "template_sede_sede_id_fkey";
            columns: ["sede_id"];
            referencedRelation: "sedi";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "template_sede_cliente_id_fkey";
            columns: ["cliente_id"];
            referencedRelation: "clienti";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "template_sede_basato_su_fkey";
            columns: ["basato_su"];
            referencedRelation: "template_cliente";
            referencedColumns: ["id"];
          }
        ];
      };
      template_audit_log: {
        Row: {
          id: string;
          template_type: string;
          template_id: string;
          utente_id: string | null;
          azione: string;
          dettagli_json: Json | null;
          eseguita_il: string;
        };
        Insert: {
          id?: string;
          template_type: string;
          template_id: string;
          utente_id?: string | null;
          azione: string;
          dettagli_json?: Json | null;
          eseguita_il?: string;
        };
        Update: {
          id?: string;
          template_type?: string;
          template_id?: string;
          utente_id?: string | null;
          azione?: string;
          dettagli_json?: Json | null;
          eseguita_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "template_audit_log_utente_id_fkey";
            columns: ["utente_id"];
            referencedRelation: "utenti";
            referencedColumns: ["id"];
          }
        ];
      };
      visite: {
        Row: {
          id: string;
          sede_id: string;
          cliente_id: string;
          specialist_id: string;
          template_master_id: string | null;
          template_cliente_id: string | null;
          template_sede_id: string | null;
          template_snapshot: Json;
          numero_verbale: string | null;
          data_visita: string;
          ora_inizio: string | null;
          referente_cliente: string | null;
          note_modifiche: string | null;
          note_conclusive: string | null;
          stato: Database["public"]["Enums"]["stato_visita"];
          stato_verbale: Database["public"]["Enums"]["stato_verbale"] | null;
          derivato_da: string | null;
          sostituisce: string | null;
          sostituito_da: string | null;
          creata_il: string;
          avviata_il: string | null;
          completata_il: string | null;
          verbale_generato_il: string | null;
          aggiornata_il: string;
        };
        Insert: {
          id?: string;
          sede_id: string;
          cliente_id: string;
          specialist_id: string;
          template_master_id?: string | null;
          template_cliente_id?: string | null;
          template_sede_id?: string | null;
          template_snapshot: Json;
          numero_verbale?: string | null;
          data_visita: string;
          ora_inizio?: string | null;
          referente_cliente?: string | null;
          note_modifiche?: string | null;
          note_conclusive?: string | null;
          stato?: Database["public"]["Enums"]["stato_visita"];
          stato_verbale?: Database["public"]["Enums"]["stato_verbale"] | null;
          derivato_da?: string | null;
          sostituisce?: string | null;
          sostituito_da?: string | null;
          creata_il?: string;
          avviata_il?: string | null;
          completata_il?: string | null;
          verbale_generato_il?: string | null;
          aggiornata_il?: string;
        };
        Update: {
          id?: string;
          sede_id?: string;
          cliente_id?: string;
          specialist_id?: string;
          template_master_id?: string | null;
          template_cliente_id?: string | null;
          template_sede_id?: string | null;
          template_snapshot?: Json;
          numero_verbale?: string | null;
          data_visita?: string;
          ora_inizio?: string | null;
          referente_cliente?: string | null;
          note_modifiche?: string | null;
          note_conclusive?: string | null;
          stato?: Database["public"]["Enums"]["stato_visita"];
          stato_verbale?: Database["public"]["Enums"]["stato_verbale"] | null;
          derivato_da?: string | null;
          sostituisce?: string | null;
          sostituito_da?: string | null;
          creata_il?: string;
          avviata_il?: string | null;
          completata_il?: string | null;
          verbale_generato_il?: string | null;
          aggiornata_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visite_sede_id_fkey";
            columns: ["sede_id"];
            referencedRelation: "sedi";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visite_cliente_id_fkey";
            columns: ["cliente_id"];
            referencedRelation: "clienti";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visite_specialist_id_fkey";
            columns: ["specialist_id"];
            referencedRelation: "utenti";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visite_template_master_id_fkey";
            columns: ["template_master_id"];
            referencedRelation: "template_master";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visite_template_cliente_id_fkey";
            columns: ["template_cliente_id"];
            referencedRelation: "template_cliente";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visite_template_sede_id_fkey";
            columns: ["template_sede_id"];
            referencedRelation: "template_sede";
            referencedColumns: ["id"];
          }
        ];
      };
      risposte: {
        Row: {
          id: string;
          visita_id: string;
          domanda_id: string;
          sezione_id: string;
          valore: Database["public"]["Enums"]["esito_risposta"] | null;
          osservazioni: string | null;
          azione_correttiva: string | null;
          campo_extra: Json | null;
          salvata_il: string;
          aggiornata_il: string;
        };
        Insert: {
          id?: string;
          visita_id: string;
          domanda_id: string;
          sezione_id: string;
          valore?: Database["public"]["Enums"]["esito_risposta"] | null;
          osservazioni?: string | null;
          azione_correttiva?: string | null;
          campo_extra?: Json | null;
          salvata_il?: string;
          aggiornata_il?: string;
        };
        Update: {
          id?: string;
          visita_id?: string;
          domanda_id?: string;
          sezione_id?: string;
          valore?: Database["public"]["Enums"]["esito_risposta"] | null;
          osservazioni?: string | null;
          azione_correttiva?: string | null;
          campo_extra?: Json | null;
          salvata_il?: string;
          aggiornata_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "risposte_visita_id_fkey";
            columns: ["visita_id"];
            referencedRelation: "visite";
            referencedColumns: ["id"];
          }
        ];
      };
      punteggi_sezione: {
        Row: {
          id: string;
          visita_id: string;
          sezione_id: string;
          n_conformi: number;
          n_parz_conformi: number;
          n_non_conformi: number;
          n_non_verificati: number;
          n_non_applicabili: number;
          calcolato_il: string;
        };
        Insert: {
          id?: string;
          visita_id: string;
          sezione_id: string;
          n_conformi?: number;
          n_parz_conformi?: number;
          n_non_conformi?: number;
          n_non_verificati?: number;
          n_non_applicabili?: number;
          calcolato_il?: string;
        };
        Update: {
          id?: string;
          visita_id?: string;
          sezione_id?: string;
          n_conformi?: number;
          n_parz_conformi?: number;
          n_non_conformi?: number;
          n_non_verificati?: number;
          n_non_applicabili?: number;
          calcolato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "punteggi_sezione_visita_id_fkey";
            columns: ["visita_id"];
            referencedRelation: "visite";
            referencedColumns: ["id"];
          }
        ];
      };
      verbali_pdf: {
        Row: {
          id: string;
          visita_id: string;
          storage_path: string;
          sha256_hash: string;
          numero_versione: number;
          dimensione_bytes: number | null;
          generato_il: string;
          generato_da: string | null;
        };
        Insert: {
          id?: string;
          visita_id: string;
          storage_path: string;
          sha256_hash: string;
          numero_versione?: number;
          dimensione_bytes?: number | null;
          generato_il?: string;
          generato_da?: string | null;
        };
        Update: {
          id?: string;
          visita_id?: string;
          storage_path?: string;
          sha256_hash?: string;
          numero_versione?: number;
          dimensione_bytes?: number | null;
          generato_il?: string;
          generato_da?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "verbali_pdf_visita_id_fkey";
            columns: ["visita_id"];
            referencedRelation: "visite";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "verbali_pdf_generato_da_fkey";
            columns: ["generato_da"];
            referencedRelation: "utenti";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_log: {
        Row: {
          id: string;
          visita_id: string | null;
          utente_id: string | null;
          azione: string;
          dettagli: Json | null;
          ip_address: string | null;
          eseguita_il: string;
        };
        Insert: {
          id?: string;
          visita_id?: string | null;
          utente_id?: string | null;
          azione: string;
          dettagli?: Json | null;
          ip_address?: string | null;
          eseguita_il?: string;
        };
        Update: {
          id?: string;
          visita_id?: string | null;
          utente_id?: string | null;
          azione?: string;
          dettagli?: Json | null;
          ip_address?: string | null;
          eseguita_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_visita_id_fkey";
            columns: ["visita_id"];
            referencedRelation: "visite";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_utente_id_fkey";
            columns: ["utente_id"];
            referencedRelation: "utenti";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      assegna_numero_verbale: {
        Args: { p_visita_id: string; p_anno?: number };
        Returns: string;
      };
      get_ruolo_utente: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["ruolo_utente"];
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      esito_risposta: "C" | "PC" | "NC" | "NV" | "NA";
      ruolo_utente: "admin" | "specialist";
      stato_verbale: "bozza" | "chiuso" | "sostituito";
      stato_visita:
        | "pianificata"
        | "in_corso"
        | "bozza"
        | "completata"
        | "verbale_generato";
    };
    CompositeTypes: Record<never, never>;
  };
};

// Helper di comodo (stesso stile dei tipi generati dal CLI Supabase)
type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
