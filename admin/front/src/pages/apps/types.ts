export type ClientKind = "app" | "service" | "external";

export interface AppListItem {
  id: string; // slug
  name: string;
  active: number;
  role_count: number;
  position_x: number | null;
  position_y: number | null;
  environment: "prod" | "preprod" | null;
  redirect_uri: string | null;
  public_url: string | null;
  type: ClientKind;
}

export type AppConnectionType = "auth" | "data" | "navigation" | "mirror";

export interface AppConnection {
  id: number;
  from_client_id: string;
  to_client_id: string | null;
  to_external_label: string | null;
  type: AppConnectionType;
  label: string | null;
  from_name: string;
  to_name: string | null;
}

export interface AppRole {
  id: number;
  name: string;
  label: string;
  permission_count: number;
}

export interface AppDetail {
  id: string;
  name: string;
  active: number;
  description: string | null;
  redirect_uri: string | null;
  public_url: string | null;
  environment: "prod" | "preprod" | null;
  is_confidential: number;
  is_external: number;
  has_secret: boolean;
  type: ClientKind;
  structure_id: number | null;
  roles: AppRole[];
}

export interface AppPermission {
  id: number;
  name: string;
  label: string;
  role_count: number;
}

export interface RoleWithPermissions {
  id: number;
  permissions: { id: number }[];
}
