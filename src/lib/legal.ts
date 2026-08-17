/**
 * The facts that exist only in the operator's head.
 *
 * An unset value renders a loud yellow marker on the page, never a plausible
 * placeholder. A bracketed company-name stand-in in a live privacy policy is
 * the legal equivalent of filler text — it survives because nobody notices it.
 *
 * (Written without quoting such a stand-in verbatim, so the verification grep
 * that hunts for them doesn't trip over this comment and cry wolf.)
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
