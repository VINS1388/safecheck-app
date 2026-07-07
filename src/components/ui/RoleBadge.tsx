import Badge from "./Badge";

// RoleBadge (Sprint 16.5 · S2) — riconciliato con la scelta palette: i ruoli si
// distinguono con TINTE DEL NAVY, mai con verde/ambra/rosso (riservati agli
// stati operativi). Sostituisce il vecchio RuoloBadge inline (purple/blue/teal,
// fuori palette) che resta in OrganizzazioneClient finché non lo si migra in uno
// step applicativo successivo.
//
// Scala:  admin = brand (navy pieno) · planner = brand-soft (navy intermedio) ·
//         specialist = brand tenue (bg brand/10, testo brand).
// L'etichetta ruolo è SEMPRE testo, mai solo colore.
//
// Nota: lo stato "disattivato" NON è un ruolo — è uno stato che sovrascrive la
// tinta ruolo e va reso con un badge di stato neutro separato (grigio), non qui.

export type Ruolo = "admin" | "planner" | "specialist";

const STILE: Record<Ruolo, string> = {
  admin: "bg-brand text-white",
  planner: "bg-brand-soft text-white",
  specialist: "bg-brand/10 text-brand",
};

const ETICHETTA: Record<Ruolo, string> = {
  admin: "Admin",
  planner: "Planner",
  specialist: "Specialist",
};

interface Props {
  ruolo: Ruolo;
  /** Etichetta alternativa (default: nome ruolo capitalizzato). */
  etichetta?: string;
  className?: string;
}

export default function RoleBadge({ ruolo, etichetta, className }: Props) {
  return (
    <Badge className={`${STILE[ruolo]} ${className ?? ""}`}>
      {etichetta ?? ETICHETTA[ruolo]}
    </Badge>
  );
}
