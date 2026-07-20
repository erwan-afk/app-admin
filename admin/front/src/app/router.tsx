import { createBrowserRouter, Navigate } from "react-router-dom";
import { Shell } from "@/components/layout/Shell";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { UsersPage } from "@/pages/users/UsersPage";
import { ClientsPage } from "@/pages/apps/ClientsPage";
import { ArchitecturePage } from "@/pages/apps/ArchitecturePage";
import { PayfitPage } from "@/pages/payfit/PayfitPage";
import { DEFAULT_PATH } from "@/app/nav";

// Coquille reconstruite le 2026-07-19 sur le modèle react-router d'app-objectifs
// (cf. Shell.tsx) — remplace le switch de sections en state local de l'ancien
// AdminLayout.tsx. Les gardes d'accès réelles restent côté serveur
// (admin/proxy.php) ; les entrées de nav masquées (Shell.tsx) ne sont qu'un
// confort d'affichage pour le rôle restreint goals_access.
export const router = createBrowserRouter([
  {
    element: <Shell />,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <Navigate to={DEFAULT_PATH} replace /> },
      { path: "users", element: <UsersPage />, handle: { title: "Utilisateurs" } },
      { path: "apps", element: <ClientsPage kind="app" />, handle: { title: "Applications" } },
      { path: "services", element: <ClientsPage kind="service" />, handle: { title: "Services" } },
      { path: "externals", element: <ClientsPage kind="external" />, handle: { title: "Externes" } },
      { path: "architecture", element: <ArchitecturePage />, handle: { title: "Architecture" } },
      { path: "payfit", element: <PayfitPage />, handle: { title: "Payfit" } },
    ],
  },
]);
