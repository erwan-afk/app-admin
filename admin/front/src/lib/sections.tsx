import {
  Users,
  AppWindow,
  Server,
  Cloud,
  Banknote,
  Network,
  type LucideIcon,
} from "lucide-react";
import { UsersPage } from "@/pages/users/UsersPage";
import { TransactionsPage } from "@/pages/transactions/TransactionsPage";
import { ClientsPage } from "@/pages/apps/ClientsPage";
import { ArchitecturePage } from "@/pages/apps/ArchitecturePage";

export interface Section {
  key: string;
  label: string;
  icon: LucideIcon;
  element: React.ReactNode;
  /** true = requiert admin_access complet ; invisible pour le rôle restreint
   *  goals_access (cf. migrations/013_admin_goals_role.sql + lib/auth.ts). */
  restricted?: boolean;
}

export interface SectionGroup {
  label: string;
  sections: Section[];
}

// Organigramme/Objectifs Groupe/Objectifs/OKR retirés le 2026-07-18 — domaine
// pilotage, désormais porté par app-objectifs (cf. Projects/auth-admin/
// plan-phase-1-nettoyage-prealable.md). Notifications retirée avec : ses
// endpoints (list/unread/read) vivaient dans GoalsController, supprimé.
// Architecture réintégrée le 2026-07-18 (fin du chantier) : PanZoom copié en
// composant local (@/components/PanZoom, ex @mediastart/goals-ui — self-
// contained, aucune autre dépendance goals-ui) plutôt qu'importé du package
// monorepo, dont la résolution npm cassait hors du monorepo d'origine.
export const SECTION_GROUPS: SectionGroup[] = [
  {
    label: "Structure",
    sections: [
      { key: "users", label: "Utilisateurs", icon: Users, element: <UsersPage />, restricted: true },
    ],
  },
  {
    label: "Gestion",
    sections: [
      { key: "apps", label: "Applications", icon: AppWindow, element: <ClientsPage kind="app" />, restricted: true },
      { key: "services", label: "Services", icon: Server, element: <ClientsPage kind="service" />, restricted: true },
      { key: "externals", label: "Externes", icon: Cloud, element: <ClientsPage kind="external" />, restricted: true },
      { key: "architecture", label: "Architecture", icon: Network, element: <ArchitecturePage />, restricted: true },
      { key: "transactions", label: "Transactions", icon: Banknote, element: <TransactionsPage />, restricted: true },
    ],
  },
];

export const SECTIONS: Section[] = SECTION_GROUPS.flatMap((g) => g.sections);
export const DEFAULT_SECTION = "users";
/** Ex-section par défaut du rôle restreint goals_access ("goals", retirée le
 *  2026-07-18 avec le domaine Pilotage) — repliée sur DEFAULT_SECTION. Aucun
 *  user goals_access/goals_manager actif en base au moment du retrait. */
export const DEFAULT_SECTION_GOALS_ONLY = DEFAULT_SECTION;
