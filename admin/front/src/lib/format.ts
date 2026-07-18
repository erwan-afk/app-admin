export function euros(v: number | null | undefined, decimals = 0): string {
  if (v == null) return "—";
  return (
    v.toLocaleString("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + " €"
  );
}

/** Format compact d'une valeur numérique (1.2M, 350k, 42). */
export function fmtVal(v: number | null | undefined): string {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
