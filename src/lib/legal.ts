/**
 * The facts that exist only in the operator's head.
 *
 * An unset value renders a loud yellow marker on the page, never a plausible
 * placeholder. "[Your Company Name]" in a live privacy policy is the legal form
 * of lorem ipsum — it survives because nobody notices it.
 */
export const legal = {
  appName: "Lanes",
  /** Who operates Lanes — the legal entity a privacy request goes to. */
  entity: null as string | null,
  /** Where privacy requests go. */
  contactEmail: null as string | null,
  /** Whose law governs the terms. */
  jurisdiction: null as string | null,
  /** Moves when the pages move. */
  lastUpdated: "17 August 2026",
};

export type LegalField = "entity" | "contactEmail" | "jurisdiction";
