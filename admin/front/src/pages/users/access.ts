import type { AdminPermission, AppGrant, AppRole } from "./types";

/** Une application telle que la renvoie `apps_with_roles` : ses profils (rôles) et ses permissions. */
export interface AppCatalog {
  id: string;
  name: string;
  roles: { id: number; name: string; label: string; permissions: AdminPermission[] }[];
  permissions: AdminPermission[];
}

/** Une permission réellement détenue, avec d'où elle vient. */
export interface EffectivePermission {
  name: string;
  label: string;
  group: string;
  /** Profils (rôles) qui l'accordent. */
  viaProfiles: string[];
  /** Cochée directement sur l'utilisateur. */
  direct: boolean;
}

export interface AppAccess {
  appId: string;
  appName: string;
  /** Profils (rôles) attribués à l'utilisateur sur cette application. */
  profiles: AppRole[];
  /** Permissions détenues : celles des profils + les droits directs, moins les refus. */
  permissions: EffectivePermission[];
  /** Permissions refusées à titre individuel (retirent même ce qu'un profil accorderait). */
  denied: { name: string; label: string }[];
}

/**
 * Accès effectif d'un utilisateur à une application, calculé comme le fait
 * auth_global (Server::getUserPermissions) : permissions des profils actifs,
 * plus les droits directs, moins les refus individuels. C'est cette liste que
 * l'application reçoit dans le jeton, donc ce qui compte réellement.
 */
export function computeAccess(
  catalog: AppCatalog[],
  appRoles: AppRole[],
  appGrants: AppGrant[],
): AppAccess[] {
  const appIds = new Set<string>([
    ...appRoles.map((r) => r.app_id),
    ...appGrants.map((g) => g.app_id),
  ]);
  return [...appIds].map((appId) => {
    const app = catalog.find((a) => a.id === appId);
    const profiles = appRoles.filter((r) => r.app_id === appId);
    const byName = new Map<string, EffectivePermission>();
    const entry = (p: { name: string; label: string; group?: string | null }) => {
      let e = byName.get(p.name);
      if (!e) {
        e = { name: p.name, label: p.label, group: p.group?.trim() || "Autres", viaProfiles: [], direct: false };
        byName.set(p.name, e);
      }
      return e;
    };
    for (const pr of profiles) {
      const role = app?.roles.find((r) => r.id === pr.app_role_id);
      for (const p of role?.permissions ?? []) entry(p).viaProfiles.push(pr.role_label);
    }
    const grants = appGrants.filter((g) => g.app_id === appId);
    for (const g of grants.filter((g) => g.granted === 1)) {
      const meta = app?.permissions.find((p) => p.id === g.permission_id);
      entry({ name: g.perm_name, label: g.perm_label, group: meta?.group }).direct = true;
    }
    const denied = grants.filter((g) => g.granted === 0);
    for (const g of denied) byName.delete(g.perm_name);
    return {
      appId,
      appName: app?.name ?? profiles[0]?.app_name ?? grants[0]?.app_slug ?? appId,
      profiles,
      permissions: [...byName.values()].sort((a, b) => a.group.localeCompare(b.group, "fr") || a.label.localeCompare(b.label, "fr")),
      denied: denied.map((g) => ({ name: g.perm_name, label: g.perm_label })),
    };
  });
}
