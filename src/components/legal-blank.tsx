import { legal, type LegalField } from "@/lib/legal";

/**
 * A hardcoded colour here is right rather than a lapse: the marker is meant to
 * look like something that doesn't belong, in both light and dark mode. The
 * exact wording is what the verification step greps the served page for, so an
 * unset field cannot ship in silence.
 */
export function LegalBlank({ field }: { field: LegalField }) {
  const value = legal[field];
  if (value) return <>{value}</>;

  return (
    <mark
      style={{
        backgroundColor: "#fde047",
        color: "#422006",
        padding: "0 0.25rem",
        borderRadius: "0.125rem",
        fontWeight: 600,
      }}
    >
      Needs your details — set `{field}` in src/lib/legal.ts
    </mark>
  );
}

/** True when the field is set, for clauses that must be omitted rather than faked. */
export function hasLegalValue(field: LegalField) {
  return Boolean(legal[field]);
}
