import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface OrgNode {
  id: number;
  parent_id: number | null;
  name: string;
  code: string | null;
  depth: number;
  type_code: string | null;
  type_label: string | null;
  user_count: number;
  /** Ex. `{ kr_types: ["rdv"] }` — liste blanche des types de KR pour
   *  lesquels ce nœud est éligible ; `null`/absent = éligible à tous (défaut
   *  rétro-compatible). Cf. discussion 2026-07-10 (Lead Generation n'a pas
   *  d'objectif de CA, même type de nœud que Sales). */
  attributes: { kr_types?: string[] | null } | null;
  children?: OrgNode[];
}

function flatten(nodes: OrgNode[], out: OrgNode[] = []): OrgNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flatten(n.children, out);
  }
  return out;
}

/** Charge l'arbre des nœuds (action=tree) et expose l'arbre + une liste plate triée. */
export function useNodes() {
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const t = await api.get<OrgNode[]>("tree");
      setTree(t);
    } catch {
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const flat = flatten(tree).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return { tree, flat, loading, reload };
}
