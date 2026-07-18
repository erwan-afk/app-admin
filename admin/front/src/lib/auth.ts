// Branchement de la SPA sur le flux OAuth2 piloté par PHP (broker Jasny SSO).
// On ne réimplémente RIEN du flux : login/callback/logout vivent côté serveur
// (admin/login.php, admin/callback.php, admin/logout.php). Ici on calcule juste
// les bonnes URLs et on type l'utilisateur courant exposé par ?action=me.

// En dev, la SPA tourne sur :5174 (Vite) alors que le backend admin est sur
// :8003 → les redirections plein écran (login/logout) doivent viser :8003.
// En prod, la SPA est servie PAR PHP (/admin/front/) donc origine relative.
export const BACKEND_ORIGIN = import.meta.env.DEV ? "http://localhost:8003" : "";

export const loginUrl = () => `${BACKEND_ORIGIN}/admin/login.php`;
export const logoutUrl = () => `${BACKEND_ORIGIN}/admin/logout.php`;

/** Claims du JWT renvoyés par ?action=me (cf. ClaimsProvider côté serveur). */
export interface CurrentUser {
  sub: string | number;
  email?: string;
  name?: string;
  perms?: string[];
  roles?: string[];
  is_codir?: boolean;
  node_id?: number | null;
  node_code?: string | null;
  /** true si admin_access (bypass total des droits is_node_manager, ADR-005). */
  manage_all?: boolean;
  /** Sans manage_all : fermeture descendante des nœuds où l'utilisateur est
   *  is_node_manager — sert à griser les actions d'écriture (lecture seule). */
  managed_node_ids?: number[];
}

/** true si l'utilisateur n'a que le rôle restreint goals_access (pas admin_access). */
export function isGoalsOnly(user: Pick<CurrentUser, "perms"> | null): boolean {
  return !!user?.perms?.includes("goals_access") && !user.perms.includes("admin_access");
}

/** Peut-il créer/éditer/supprimer un objectif porté par ce nœud ? */
export function canManageNode(
  user: Pick<CurrentUser, "manage_all" | "managed_node_ids"> | null,
  nodeId: number | null | undefined,
): boolean {
  if (!user || nodeId == null) return false;
  if (user.manage_all) return true;
  return !!user.managed_node_ids?.includes(nodeId);
}

/** Initiales pour l'avatar : à partir du nom, sinon de l'email, sinon "?". */
export function initials(user: Pick<CurrentUser, "name" | "email">): string {
  const src = (user.name || user.email || "").trim();
  if (!src) return "?";
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
  return letters.toUpperCase();
}
