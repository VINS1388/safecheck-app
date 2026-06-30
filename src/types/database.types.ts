export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          azione: string
          dettagli: Json | null
          eseguita_il: string
          id: string
          ip_address: string | null
          utente_id: string | null
          visita_id: string | null
        }
        Insert: {
          azione: string
          dettagli?: Json | null
          eseguita_il?: string
          id?: string
          ip_address?: string | null
          utente_id?: string | null
          visita_id?: string | null
        }
        Update: {
          azione?: string
          dettagli?: Json | null
          eseguita_il?: string
          id?: string
          ip_address?: string | null
          utente_id?: string | null
          visita_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_utente_id_fkey"
            columns: ["utente_id"]
            isOneToOne: false
            referencedRelation: "utenti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visite"
            referencedColumns: ["id"]
          },
        ]
      }
      clienti: {
        Row: {
          aggiornato_il: string
          attivo: boolean
          cap: string | null
          citta: string | null
          codice_fiscale: string | null
          creato_da: string | null
          creato_il: string
          email_referente: string | null
          id: string
          indirizzo_sede_legale: string | null
          note: string | null
          partita_iva: string | null
          provincia: string | null
          ragione_sociale: string
          referente_principale: string | null
          telefono_referente: string | null
        }
        Insert: {
          aggiornato_il?: string
          attivo?: boolean
          cap?: string | null
          citta?: string | null
          codice_fiscale?: string | null
          creato_da?: string | null
          creato_il?: string
          email_referente?: string | null
          id?: string
          indirizzo_sede_legale?: string | null
          note?: string | null
          partita_iva?: string | null
          provincia?: string | null
          ragione_sociale: string
          referente_principale?: string | null
          telefono_referente?: string | null
        }
        Update: {
          aggiornato_il?: string
          attivo?: boolean
          cap?: string | null
          citta?: string | null
          codice_fiscale?: string | null
          creato_da?: string | null
          creato_il?: string
          email_referente?: string | null
          id?: string
          indirizzo_sede_legale?: string | null
          note?: string | null
          partita_iva?: string | null
          provincia?: string | null
          ragione_sociale?: string
          referente_principale?: string | null
          telefono_referente?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clienti_creato_da_fkey"
            columns: ["creato_da"]
            isOneToOne: false
            referencedRelation: "utenti"
            referencedColumns: ["id"]
          },
        ]
      }
      imprese_appalto: {
        Row: {
          aggiornato_il: string
          creato_il: string
          id: string
          ordine: number
          ragione_sociale: string
          tipo_impresa: string
          visita_id: string
        }
        Insert: {
          aggiornato_il?: string
          creato_il?: string
          id?: string
          ordine?: number
          ragione_sociale: string
          tipo_impresa: string
          visita_id: string
        }
        Update: {
          aggiornato_il?: string
          creato_il?: string
          id?: string
          ordine?: number
          ragione_sociale?: string
          tipo_impresa?: string
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imprese_appalto_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visite"
            referencedColumns: ["id"]
          },
        ]
      }
      risposte_imprese_appalto: {
        Row: {
          aggiornato_il: string
          azione_correttiva: string | null
          creato_il: string
          domanda_id: string
          esito: Database["public"]["Enums"]["esito_risposta"]
          id: string
          impresa_id: string
          osservazione: string | null
        }
        Insert: {
          aggiornato_il?: string
          azione_correttiva?: string | null
          creato_il?: string
          domanda_id: string
          esito: Database["public"]["Enums"]["esito_risposta"]
          id?: string
          impresa_id: string
          osservazione?: string | null
        }
        Update: {
          aggiornato_il?: string
          azione_correttiva?: string | null
          creato_il?: string
          domanda_id?: string
          esito?: Database["public"]["Enums"]["esito_risposta"]
          id?: string
          impresa_id?: string
          osservazione?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risposte_imprese_appalto_impresa_id_fkey"
            columns: ["impresa_id"]
            isOneToOne: false
            referencedRelation: "imprese_appalto"
            referencedColumns: ["id"]
          },
        ]
      }
      punteggi_sezione: {
        Row: {
          calcolato_il: string
          id: string
          n_conformi: number
          n_non_applicabili: number
          n_non_conformi: number
          n_non_verificati: number
          n_parz_conformi: number
          sezione_id: string
          visita_id: string
        }
        Insert: {
          calcolato_il?: string
          id?: string
          n_conformi?: number
          n_non_applicabili?: number
          n_non_conformi?: number
          n_non_verificati?: number
          n_parz_conformi?: number
          sezione_id: string
          visita_id: string
        }
        Update: {
          calcolato_il?: string
          id?: string
          n_conformi?: number
          n_non_applicabili?: number
          n_non_conformi?: number
          n_non_verificati?: number
          n_parz_conformi?: number
          sezione_id?: string
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "punteggi_sezione_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visite"
            referencedColumns: ["id"]
          },
        ]
      }
      risposte: {
        Row: {
          aggiornata_il: string
          azione_correttiva: string | null
          campo_extra: Json | null
          domanda_id: string
          id: string
          osservazioni: string | null
          salvata_il: string
          sezione_id: string
          valore: Database["public"]["Enums"]["esito_risposta"] | null
          visita_id: string
        }
        Insert: {
          aggiornata_il?: string
          azione_correttiva?: string | null
          campo_extra?: Json | null
          domanda_id: string
          id?: string
          osservazioni?: string | null
          salvata_il?: string
          sezione_id: string
          valore?: Database["public"]["Enums"]["esito_risposta"] | null
          visita_id: string
        }
        Update: {
          aggiornata_il?: string
          azione_correttiva?: string | null
          campo_extra?: Json | null
          domanda_id?: string
          id?: string
          osservazioni?: string | null
          salvata_il?: string
          sezione_id?: string
          valore?: Database["public"]["Enums"]["esito_risposta"] | null
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risposte_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visite"
            referencedColumns: ["id"]
          },
        ]
      }
      sedi: {
        Row: {
          aggiornato_il: string
          attiva: boolean
          cap: string | null
          citta: string
          cliente_id: string
          creato_il: string
          id: string
          indirizzo: string
          nome: string
          note: string | null
          principale: boolean
          provincia: string | null
          referente_sede: string | null
          telefono_referente: string | null
        }
        Insert: {
          aggiornato_il?: string
          attiva?: boolean
          cap?: string | null
          citta: string
          cliente_id: string
          creato_il?: string
          id?: string
          indirizzo: string
          nome: string
          note?: string | null
          principale?: boolean
          provincia?: string | null
          referente_sede?: string | null
          telefono_referente?: string | null
        }
        Update: {
          aggiornato_il?: string
          attiva?: boolean
          cap?: string | null
          citta?: string
          cliente_id?: string
          creato_il?: string
          id?: string
          indirizzo?: string
          nome?: string
          note?: string | null
          principale?: boolean
          provincia?: string | null
          referente_sede?: string | null
          telefono_referente?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sedi_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
        ]
      }
      template_audit_log: {
        Row: {
          azione: string
          dettagli_json: Json | null
          eseguita_il: string
          id: string
          template_id: string
          template_type: string
          utente_id: string | null
        }
        Insert: {
          azione: string
          dettagli_json?: Json | null
          eseguita_il?: string
          id?: string
          template_id: string
          template_type: string
          utente_id?: string | null
        }
        Update: {
          azione?: string
          dettagli_json?: Json | null
          eseguita_il?: string
          id?: string
          template_id?: string
          template_type?: string
          utente_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_audit_log_utente_id_fkey"
            columns: ["utente_id"]
            isOneToOne: false
            referencedRelation: "utenti"
            referencedColumns: ["id"]
          },
        ]
      }
      template_cliente: {
        Row: {
          basato_su: string | null
          cliente_id: string
          creato_il: string
          id: string
          modificato_da: string | null
          modificato_il: string
          struttura_json: Json
          versione: number
        }
        Insert: {
          basato_su?: string | null
          cliente_id: string
          creato_il?: string
          id?: string
          modificato_da?: string | null
          modificato_il?: string
          struttura_json: Json
          versione?: number
        }
        Update: {
          basato_su?: string | null
          cliente_id?: string
          creato_il?: string
          id?: string
          modificato_da?: string | null
          modificato_il?: string
          struttura_json?: Json
          versione?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_cliente_basato_su_fkey"
            columns: ["basato_su"]
            isOneToOne: false
            referencedRelation: "template_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_cliente_modificato_da_fkey"
            columns: ["modificato_da"]
            isOneToOne: false
            referencedRelation: "utenti"
            referencedColumns: ["id"]
          },
        ]
      }
      template_master: {
        Row: {
          attivo: boolean
          creato_da: string | null
          creato_il: string
          descrizione: string | null
          id: string
          nome: string
          struttura_json: Json
          versione: number
        }
        Insert: {
          attivo?: boolean
          creato_da?: string | null
          creato_il?: string
          descrizione?: string | null
          id?: string
          nome: string
          struttura_json: Json
          versione?: number
        }
        Update: {
          attivo?: boolean
          creato_da?: string | null
          creato_il?: string
          descrizione?: string | null
          id?: string
          nome?: string
          struttura_json?: Json
          versione?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_master_creato_da_fkey"
            columns: ["creato_da"]
            isOneToOne: false
            referencedRelation: "utenti"
            referencedColumns: ["id"]
          },
        ]
      }
      template_sede: {
        Row: {
          basato_su: string | null
          cliente_id: string
          creato_il: string
          id: string
          modificato_da: string | null
          modificato_il: string
          sede_id: string
          struttura_json: Json
          versione: number
        }
        Insert: {
          basato_su?: string | null
          cliente_id: string
          creato_il?: string
          id?: string
          modificato_da?: string | null
          modificato_il?: string
          sede_id: string
          struttura_json: Json
          versione?: number
        }
        Update: {
          basato_su?: string | null
          cliente_id?: string
          creato_il?: string
          id?: string
          modificato_da?: string | null
          modificato_il?: string
          sede_id?: string
          struttura_json?: Json
          versione?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_sede_basato_su_fkey"
            columns: ["basato_su"]
            isOneToOne: false
            referencedRelation: "template_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_sede_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_sede_modificato_da_fkey"
            columns: ["modificato_da"]
            isOneToOne: false
            referencedRelation: "utenti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_sede_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedi"
            referencedColumns: ["id"]
          },
        ]
      }
      utenti: {
        Row: {
          aggiornato_il: string
          attivo: boolean
          creato_il: string
          email: string
          id: string
          nome_completo: string
          qualifica: string | null
          ruolo: Database["public"]["Enums"]["ruolo_utente"]
          telefono: string | null
        }
        Insert: {
          aggiornato_il?: string
          attivo?: boolean
          creato_il?: string
          email: string
          id: string
          nome_completo: string
          qualifica?: string | null
          ruolo?: Database["public"]["Enums"]["ruolo_utente"]
          telefono?: string | null
        }
        Update: {
          aggiornato_il?: string
          attivo?: boolean
          creato_il?: string
          email?: string
          id?: string
          nome_completo?: string
          qualifica?: string | null
          ruolo?: Database["public"]["Enums"]["ruolo_utente"]
          telefono?: string | null
        }
        Relationships: []
      }
      verbali_pdf: {
        Row: {
          dimensione_bytes: number | null
          generato_da: string | null
          generato_il: string
          id: string
          numero_versione: number
          sha256_hash: string
          storage_path: string
          visita_id: string
        }
        Insert: {
          dimensione_bytes?: number | null
          generato_da?: string | null
          generato_il?: string
          id?: string
          numero_versione?: number
          sha256_hash: string
          storage_path: string
          visita_id: string
        }
        Update: {
          dimensione_bytes?: number | null
          generato_da?: string | null
          generato_il?: string
          id?: string
          numero_versione?: number
          sha256_hash?: string
          storage_path?: string
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verbali_pdf_generato_da_fkey"
            columns: ["generato_da"]
            isOneToOne: false
            referencedRelation: "utenti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verbali_pdf_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visite"
            referencedColumns: ["id"]
          },
        ]
      }
      visite: {
        Row: {
          aggiornata_il: string
          avviata_il: string | null
          cliente_id: string
          completata_il: string | null
          creata_il: string
          data_visita: string
          derivato_da: string | null
          id: string
          note_conclusive: string | null
          note_modifiche: string | null
          numero_verbale: string | null
          ora_inizio: string | null
          referente_cliente: string | null
          sede_id: string
          sostituisce: string | null
          sostituito_da: string | null
          specialist_id: string
          stato: Database["public"]["Enums"]["stato_visita"]
          stato_verbale: Database["public"]["Enums"]["stato_verbale"] | null
          template_cliente_id: string | null
          template_master_id: string | null
          template_sede_id: string | null
          template_snapshot: Json
          verbale_generato_il: string | null
        }
        Insert: {
          aggiornata_il?: string
          avviata_il?: string | null
          cliente_id: string
          completata_il?: string | null
          creata_il?: string
          data_visita: string
          derivato_da?: string | null
          id?: string
          note_conclusive?: string | null
          note_modifiche?: string | null
          numero_verbale?: string | null
          ora_inizio?: string | null
          referente_cliente?: string | null
          sede_id: string
          sostituisce?: string | null
          sostituito_da?: string | null
          specialist_id: string
          stato?: Database["public"]["Enums"]["stato_visita"]
          stato_verbale?: Database["public"]["Enums"]["stato_verbale"] | null
          template_cliente_id?: string | null
          template_master_id?: string | null
          template_sede_id?: string | null
          template_snapshot: Json
          verbale_generato_il?: string | null
        }
        Update: {
          aggiornata_il?: string
          avviata_il?: string | null
          cliente_id?: string
          completata_il?: string | null
          creata_il?: string
          data_visita?: string
          derivato_da?: string | null
          id?: string
          note_conclusive?: string | null
          note_modifiche?: string | null
          numero_verbale?: string | null
          ora_inizio?: string | null
          referente_cliente?: string | null
          sede_id?: string
          sostituisce?: string | null
          sostituito_da?: string | null
          specialist_id?: string
          stato?: Database["public"]["Enums"]["stato_visita"]
          stato_verbale?: Database["public"]["Enums"]["stato_verbale"] | null
          template_cliente_id?: string | null
          template_master_id?: string | null
          template_sede_id?: string | null
          template_snapshot?: Json
          verbale_generato_il?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visite_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visite_derivato_da_fkey"
            columns: ["derivato_da"]
            isOneToOne: false
            referencedRelation: "visite"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visite_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visite_sostituisce_fkey"
            columns: ["sostituisce"]
            isOneToOne: false
            referencedRelation: "visite"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visite_sostituito_da_fkey"
            columns: ["sostituito_da"]
            isOneToOne: false
            referencedRelation: "visite"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visite_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "utenti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visite_template_cliente_id_fkey"
            columns: ["template_cliente_id"]
            isOneToOne: false
            referencedRelation: "template_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visite_template_master_id_fkey"
            columns: ["template_master_id"]
            isOneToOne: false
            referencedRelation: "template_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visite_template_sede_id_fkey"
            columns: ["template_sede_id"]
            isOneToOne: false
            referencedRelation: "template_sede"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assegna_numero_verbale: {
        Args: { p_anno?: number; p_visita_id: string }
        Returns: string
      }
      clona_visita: {
        Args: { p_source_id: string; p_sostitutivo: boolean }
        Returns: string
      }
      dashboard_kpi: {
        Args: never
        Returns: {
          clienti_attivi: number
          verbali_totali: number
          nc_verbali_chiusi: number
          ultimo_sopralluogo: string | null
        }[]
      }
      dashboard_clienti: {
        Args: never
        Returns: {
          id: string
          ragione_sociale: string
          citta: string | null
          n_sedi: number
          n_verbali: number
          ultima_visita: string | null
        }[]
      }
      get_ruolo_utente: {
        Args: never
        Returns: Database["public"]["Enums"]["ruolo_utente"]
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      esito_risposta: "C" | "PC" | "NC" | "NV" | "NA"
      ruolo_utente: "admin" | "specialist"
      stato_verbale: "bozza" | "chiuso" | "sostituito"
      stato_visita:
        | "pianificata"
        | "in_corso"
        | "bozza"
        | "completata"
        | "verbale_generato"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      esito_risposta: ["C", "PC", "NC", "NV", "NA"],
      ruolo_utente: ["admin", "specialist"],
      stato_verbale: ["bozza", "chiuso", "sostituito"],
      stato_visita: [
        "pianificata",
        "in_corso",
        "bozza",
        "completata",
        "verbale_generato",
      ],
    },
  },
} as const
