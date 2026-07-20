import { Users, AppWindow, Server, Cloud, Network, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** true = requiert admin_access complet ; invisible pour le rôle restreint
   *  goals_access (cf. migrations/013_admin_goals_role.sql + lib/auth.ts). */
  restricted?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Organigramme/Objectifs Groupe/Objectifs/OKR/Notifications retirés le
// 2026-07-18 — domaine pilotage, désormais porté par app-objectifs (cf.
// Projects/app-admin/plan-phase-1-nettoyage-prealable.md). Coquille reconstruite
// le 2026-07-19 sur le modèle react-router d'app-objectifs (cf. Shell.tsx) —
// remplace l'ancien lib/sections.tsx (data + JSX inline + switch de state local).
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Structure",
    items: [{ to: "/users", label: "Utilisateurs", icon: Users, restricted: true }],
  },
  {
    label: "Gestion",
    items: [
      { to: "/apps", label: "Applications", icon: AppWindow, restricted: true },
      { to: "/services", label: "Services", icon: Server, restricted: true },
      { to: "/externals", label: "Externes", icon: Cloud, restricted: true },
      { to: "/architecture", label: "Architecture", icon: Network, restricted: true },
      { to: "/payfit", label: "Payfit", icon: RefreshCw, restricted: true },
    ],
  },
];

export const DEFAULT_PATH = "/users";
