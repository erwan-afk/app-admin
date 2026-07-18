import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  SECTIONS,
  SECTION_GROUPS,
  DEFAULT_SECTION,
  DEFAULT_SECTION_GOALS_ONLY,
  type Section,
} from "@/lib/sections";
import { Logo } from "@/components/Logo";
import { NavUser } from "@/components/nav-user";
import { useAuth } from "@/context/AuthContext";
import { isGoalsOnly } from "@/lib/auth";

function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

const SPA_BASE = "";

function currentSection(visible: Section[], fallback: string): string {
  const path = window.location.pathname;
  const rel = path.startsWith(SPA_BASE) ? path.slice(SPA_BASE.length) : path;
  const key = rel.replace(/^\//, "").split("/")[0];
  return visible.some((s) => s.key === key) ? key : fallback;
}

export function AdminLayout() {
  const { dark, toggle: toggleDark } = useDarkMode();
  const { user, logout } = useAuth();

  // Rôle restreint goals_access : seules les sections non `restricted` sont
  // visibles (pas d'Organigramme/Utilisateurs/Objectifs Groupe/Applications/
  // Transactions — cf. lib/sections.tsx + migrations/013).
  const goalsOnly = isGoalsOnly(user);
  const visibleSections = goalsOnly
    ? SECTIONS.filter((s) => !s.restricted)
    : SECTIONS;
  const visibleGroups = goalsOnly
    ? SECTION_GROUPS.map((g) => ({
        ...g,
        sections: g.sections.filter((s) => !s.restricted),
      })).filter((g) => g.sections.length > 0)
    : SECTION_GROUPS;
  const defaultSection = goalsOnly
    ? DEFAULT_SECTION_GOALS_ONLY
    : DEFAULT_SECTION;

  const [active, setActive] = useState<string>(() =>
    currentSection(visibleSections, defaultSection),
  );

  useEffect(() => {
    const onPop = () =>
      setActive(currentSection(visibleSections, defaultSection));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalsOnly]);

  const go = (key: string) => {
    window.history.pushState(null, "", `${SPA_BASE}/${key}`);
    setActive(key);
  };

  const activeLabel = SECTIONS.find((s) => s.key === active)?.label ?? "";

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar variant="inset">
        <SidebarHeader className="flex h-14 shrink-0 flex-row items-center px-4">
          <a
            href={`${SPA_BASE}/`}
            className="flex w-full items-center"
            aria-label="Mediastart Admin — accueil"
          >
            <Logo className="h-full w-full object-contain" />
          </a>
        </SidebarHeader>

        <SidebarContent>
          {visibleGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.sections.map((s) => {
                    const Icon = s.icon;
                    return (
                      <SidebarMenuItem key={s.key}>
                        <SidebarMenuButton
                          isActive={active === s.key}
                          onClick={() => go(s.key)}
                          tooltip={s.label}
                        >
                          <Icon />
                          <span>{s.label}</span>
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
          {user && (
            <NavUser
              user={user}
              dark={dark}
              onToggleDark={toggleDark}
              onLogout={logout}
              onNotifications={() => go("notifications")}
            />
          )}
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="overflow-hidden">
        <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <span className="text-sm font-medium">{activeLabel}</span>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          {SECTIONS.map((s) => (
            <div key={s.key} hidden={active !== s.key} className="h-full">
              {active === s.key && s.element}
            </div>
          ))}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
