import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { NavLink, Outlet, useLocation, useMatches } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { NavUser } from "@/components/nav-user";
import { Logo } from "@/components/Logo";
import { NAV_GROUPS } from "@/app/nav";
import { useAuth } from "@/context/AuthContext";
import { isGoalsOnly } from "@/lib/auth";

function useDarkMode() {
  // Clair par défaut tant que l'utilisateur n'a rien choisi explicitement
  // (même convention que app-objectifs, cf. 2026-07-18).
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem("theme") === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

/** Coquille persistante (sidebar + header + <Outlet/>), sur le modèle exact
 *  d'app-objectifs (Shell.tsx) — remplace l'ancien AdminLayout.tsx qui gérait
 *  sa propre navigation en state local (divs cachées + pushState manuel). */
export function Shell() {
  const { user, logout } = useAuth();
  const { dark, toggle: toggleDark } = useDarkMode();
  const location = useLocation();
  const matches = useMatches();
  const title = (matches.at(-1)?.handle as { title?: string } | undefined)?.title ?? "";

  // Rôle restreint goals_access : seules les entrées non `restricted` sont
  // visibles (cf. app/nav.ts + lib/auth.ts + migrations/013).
  const goalsOnly = isGoalsOnly(user);
  const navGroups = goalsOnly
    ? NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.restricted) })).filter(
        (g) => g.items.length > 0,
      )
    : NAV_GROUPS;

  if (!user) return null;

  return (
    <TooltipProvider>
      <SidebarProvider
        className="h-svh overflow-hidden"
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as CSSProperties
        }
      >
        <Sidebar variant="inset">
          <SidebarHeader className="flex h-14 shrink-0 flex-row items-center px-4">
            <a href="/" className="flex w-full items-center" aria-label="Mediastart Admin — accueil">
              <Logo className="h-full w-full object-contain" />
            </a>
          </SidebarHeader>

          <SidebarContent>
            {navGroups.map((group) => (
              <SidebarGroup key={group.label}>
                <span className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {group.items.map((item) => {
                      const isActive = location.pathname.startsWith(item.to);
                      return (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            tooltip={item.label}
                            className="h-9 rounded-lg"
                          >
                            <NavLink to={item.to}>
                              <item.icon />
                              <span>{item.label}</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter>
            <NavUser user={user} dark={dark} onToggleDark={toggleDark} onLogout={logout} />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="overflow-hidden bg-background">
          <header className="bg-card sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center gap-2 border-b">
            <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
              <span className="flex-1 text-base font-medium">{title}</span>
            </div>
          </header>
          <div className="@container/main min-h-0 flex-1 overflow-auto">
            <div className="mx-auto flex h-full w-full max-w-[2000px] flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
              <Outlet />
            </div>
          </div>
        </SidebarInset>

        <Toaster richColors position="top-right" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
