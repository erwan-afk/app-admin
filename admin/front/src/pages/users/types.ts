// Formes renvoyées par api.php?action=users / ?action=user
export interface UserRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  grade: string | null;
  active: number; // 0 | 1
}

export interface UserDetail {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  email_perso: string | null;
  hire_date: string | null;
  is_codir: number;
  active: number;
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
  assignments: Assignment[];
  app_roles: AppRole[];
  app_grants: AppGrant[];
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
