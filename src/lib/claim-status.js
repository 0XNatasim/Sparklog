// Souper and parking claims that count as a cost: still to review (pending) or accepted. A refused
// claim is never paid, so no report adds it (Coûts, sommaire imprimé, Semaine/mois — V2.4.148).
export const COUNTED_CLAIM_STATUSES = ["pending", "approved"];
