import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Users as UsersIcon, ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { UserRow } from "./types";
import { UserFormDialog } from "./UserFormDialog";
import { UserProfile } from "./UserProfile";

const ALL = "__all__";

function initials(u: Pick<UserRow, "first_name" | "last_name">): string {
  return `${u.first_name[0] ?? ""}${u.last_name[0] ?? ""}`.toUpperCase();
}

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [structureFilter, setStructureFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [sortDesc, setSortDesc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  // undefined = fermé · null = création · number = édition
  const [editing, setEditing] = useState<number | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.get<UserRow[]>("users"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  // Liste chargée une seule fois — recherche + filtres appliqués côté client
  // (68 utilisateurs, pas de pagination) : un round-trip réseau par frappe
  // sur un dataset déjà en mémoire ajoutait une latence perceptible pour rien
  // (retour Ethibaud "pourquoi ce n'est pas instantané", 2026-07-19).
  useEffect(() => {
    load();
  }, [load]);

  const structures = useMemo(
    () =>
      Array.from(new Set(users.map((u) => u.node_name).filter((n): n is string => !!n))).sort(),
    [users],
  );

  const term = search.trim().toLowerCase();
  const visible = users
    .filter((u) => {
      if (structureFilter !== ALL && u.node_name !== structureFilter) return false;
      if (statusFilter === "active" && u.active !== 1) return false;
      if (statusFilter === "inactive" && u.active !== 0) return false;
      if (term) {
        const haystack = `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const cmp = a.first_name.localeCompare(b.first_name);
      return sortDesc ? -cmp : cmp;
    });

  const activeCount = users.filter((u) => u.active === 1).length;

  return (
    <div className="flex h-full">
      {/* Liste */}
      <aside className="flex w-80 shrink-0 flex-col border-r">
        <div className="space-y-2 border-b p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Utilisateurs</span>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              <Plus className="size-4" />
            </Button>
          </div>
          <Input
            placeholder="Rechercher (nom, email)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
          <div className="flex gap-1.5">
            <Select value={structureFilter} onValueChange={setStructureFilter}>
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue placeholder="Structure" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Toutes structures</SelectItem>
                {structures.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous</SelectItem>
                <SelectItem value="active">Actifs</SelectItem>
                <SelectItem value="inactive">Inactifs</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="size-8 shrink-0"
              title={sortDesc ? "Ordre : Z → A (clic pour A → Z)" : "Ordre : A → Z (clic pour Z → A)"}
              onClick={() => setSortDesc((d) => !d)}
            >
              {sortDesc ? <ArrowDownAZ className="size-4" /> : <ArrowUpAZ className="size-4" />}
            </Button>
          </div>
          {!loading && (
            <p className="text-muted-foreground text-xs">
              <strong>{visible.length}</strong> / {users.length} utilisateurs · {activeCount} actifs
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Chargement…</p>
          ) : visible.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Aucun utilisateur trouvé
            </p>
          ) : (
            visible.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelected(u.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left",
                  selected === u.id ? "bg-secondary" : "hover:bg-muted",
                  u.active !== 1 && "opacity-60",
                )}
              >
                <Avatar className="size-8 shrink-0">
                  {u.photo && <AvatarImage src={u.photo} alt="" />}
                  <AvatarFallback className="text-xs font-medium">
                    {initials(u)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {u.first_name} {u.last_name}
                    </span>
                    {u.active !== 1 && (
                      <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px] font-normal">
                        Inactif
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground truncate text-xs">
                    {[u.grade, u.node_name].filter(Boolean).join(" · ") || "Non affecté"}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Profil */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
            <UsersIcon className="size-10 opacity-30" />
            <p>Sélectionne un utilisateur</p>
          </div>
        ) : (
          <UserProfile
            key={selected}
            userId={selected}
            onEdit={() => setEditing(selected)}
            onDeleted={() => {
              setSelected(null);
              load();
            }}
          />
        )}
      </div>

      <UserFormDialog
        userId={editing}
        onClose={() => setEditing(undefined)}
        onSaved={load}
      />
    </div>
  );
}
