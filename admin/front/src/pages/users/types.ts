// Formes renvoyées par api.php?action=users / ?action=user. UserController::
// index() fait déjà `SELECT u.*, ...` côté serveur (users list) — ces champs
// sont réellement présents dans la réponse même s'ils n'étaient pas déclarés
// avant le 2026-07-19 ; les typer ici évite un aller-retour réseau en plus
// pour peupler la liste enrichie (avatar/structure/équipe Payfit).
export interface UserRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  photo: string | null;
  grade: string | null;
  node_name: string | null;
  team_name: string | null;
  is_codir: number;
  active: number; // 0 | 1
}

export interface UserDetail {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  email_perso: string | null;
  photo: string | null;
  hire_date: string | null;
  disabled_at: string | null;
  is_codir: number;
  active: number;
  payfit_id: string | null;
  matricule: string | null;
  team_name: string | null;
  manager_payfit_id: string | null;
  payfit_contract_id: string | null;
}

export interface Credentials {
  creation_status: string;
  last_login_at: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
}

/** Coût employeur mensuel net (charges patronales incluses) — PAS un salaire
 *  net versé au collaborateur. Cf. UserController::payfitCost côté serveur
 *  (filtre classe 6 PCG + COALESCE, même logique que la masse salariale par
 *  nœud). null si pas de payfit_contract_id ou aucune écriture comptable. */
export interface PayfitCost {
  period: string;
  net: number | null;
}

export interface Assignment {
  id: number;
  node_name: string;
  node_type: string;
  grade: string | null;
  grade_id: number | null;
  label: string | null;
  is_primary: number;
  is_node_manager: number;
  valid_from: string;
  valid_until: string | null;
}

export interface AppRole {
  id: number;
  app_id: string;
  app_role_id: number;
  app_slug: string;
  app_name: string;
  role_name: string;
  role_label: string;
  valid_from: string;
  valid_until: string | null;
}

export interface AppGrant {
  app_id: string;
  permission_id: number;
  granted: number;
  note: string | null;
  valid_until: string | null;
  perm_name: string;
  perm_label: string;
  app_slug: string;
}

export interface AdminPermission {
  id: number;
  name: string;
  label: string;
}

// Grade d'assignation — GET /grades (UserController::grades()). Vivait dans
// pages/org/types.ts avant le retrait du domaine Pilotage (2026-07-18).
export interface Grade {
  id: number;
  label: string;
}

export interface UserDetailResponse {
  user: UserDetail;
  credentials: Credentials | null;
  assignments: Assignment[];
  app_roles: AppRole[];
  app_grants: AppGrant[];
  payfit_cost: PayfitCost | null;
}

// Payload des formulaires création / édition
export interface UserFormValues {
  first_name: string;
  last_name: string;
  email: string;
  hire_date: string;
  email_perso: string;
  is_codir: number;
  active: number;
}
