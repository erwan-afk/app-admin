import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Users2, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { DuplicateGroup } from "./types";

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Détection des doublons (même nom normalisé) — pattern de l'incident du
 *  2026-07-17 (pull Payfit créant un compte au lieu de matcher l'existant).
 *  Pure revue manuelle : on affiche, on ne décide rien à la place de l'admin.
 *  "Désactiver" = soft delete (users.active=0, réversible via Modifier),
 *  jamais une suppression définitive. */
export function DuplicatesSection() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await api.get<DuplicateGroup[]>("user_duplicates"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDeactivate(userId: number, label: string) {
    if (!confirm(`Désactiver le compte « ${label} » ? Réversible depuis sa fiche (Modifier).`)) return;
    setBusy(userId);
    try {
      await api.del("delete_user", { id: userId });
      toast.success("Compte désactivé");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground py-4 text-center text-sm">Recherche de doublons…</p>;
  }

  if (groups.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-sm">Aucun doublon détecté.</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <Card key={`${g.first_name}-${g.last_name}`}>
          <CardContent className="space-y-2 p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Users2 className="size-4" />
              {g.first_name} {g.last_name}
              <span className="text-muted-foreground font-normal">— {g.users.length} comptes</span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.users.map((u) => {
                const hasData = u.assignment_count > 0 || u.role_count > 0;
                return (
                  <div key={u.id} className="space-y-1.5 rounded-md border p-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      {u.active === 1 ? (
                        <Badge variant="secondary" className="px-1 py-0 text-[10px] font-normal">
                          Actif
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal">
                          Inactif
                        </Badge>
                      )}
                      {hasData ? (
                        <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal">
                          {u.assignment_count} assignation(s) · {u.role_count} rôle(s)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground px-1 py-0 text-[10px] font-normal">
                          Vide, aucune donnée liée
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium">{u.email}</p>
                    <p className="text-muted-foreground">
                      {u.payfit_id ? `payfit_id=${u.payfit_id}` : "Compte manuel (pas Payfit)"}
                    </p>
                    <p className="text-muted-foreground">
                      {u.node_name ?? "Non affecté"} · créé le {fmtDate(u.created_at)}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={busy === u.id}
                      onClick={() => handleDeactivate(u.id, `${u.first_name} ${u.last_name}`)}
                    >
                      <Ban className="size-3.5" /> Désactiver ce compte
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
