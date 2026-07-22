import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Pencil, Trash2, CircleCheck, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { PayfitCompany } from "./types";
import { PayfitCompanyDialog } from "./PayfitCompanyDialog";
import { DuplicatesSection } from "./DuplicatesSection";

function fmtDateTime(d: string | null): string {
  if (!d) return "Jamais synchronisé";
  return new Date(d).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

export function PayfitPage() {
  const [companies, setCompanies] = useState<PayfitCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);
  // undefined = fermé · null = création · PayfitCompany = édition
  const [editing, setEditing] = useState<PayfitCompany | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCompanies(await api.get<PayfitCompany[]>("payfit_companies"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync(c: PayfitCompany) {
    setSyncing(c.id);
    try {
      const updated = await api.post<PayfitCompany>("sync_payfit_company", { id: c.id });
      setCompanies((prev) => prev.map((p) => (p.id === c.id ? updated : p)));
      const s = updated.last_sync_summary;
      if (s) {
        const accounting = s.accounting?.error
          ? `, masse salariale échouée (${s.accounting.error})`
          : s.accounting
            ? `, ${s.accounting.fetched ?? 0} écriture(s) comptable(s)`
            : "";
        toast.success(
          `${c.label} : ${s.created ?? 0} créé(s), ${s.synced ?? 0} synchronisé(s), ${s.deactivated ?? 0} désactivé(s)${s.errors ? `, ${s.errors} erreur(s)` : ""}${accounting}`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Synchronisation échouée");
      // Le serveur persiste last_synced_at/last_sync_summary même en cas
      // d'échec (avant de lever l'exception) — recharger pour l'afficher
      // sans attendre un F5 manuel.
      load();
    } finally {
      setSyncing(null);
    }
  }

  async function handleDelete(c: PayfitCompany) {
    if (!confirm(`Supprimer la configuration « ${c.label} » ?`)) return;
    try {
      await api.del("delete_payfit_company", { id: c.id });
      toast.success("Configuration supprimée");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">Synchronisation Payfit</p>
        <Button onClick={() => setEditing(null)} className="shrink-0">
          <Plus className="size-4" /> Nouvelle entreprise
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-8 text-center text-sm">Chargement…</p>
      ) : companies.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Aucune entreprise Payfit configurée.
        </p>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => {
            const s = c.last_sync_summary;
            return (
              <Card key={c.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.label}</span>
                        {c.active === 1 ? (
                          <Badge variant="secondary">Actif</Badge>
                        ) : (
                          <Badge variant="outline">Inactif</Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground font-mono text-xs">
                        {c.api_key_masked}
                        {c.company_id ? ` · company_id=${c.company_id}` : ""} · @{c.email_domain}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={syncing === c.id}
                        onClick={() => handleSync(c)}
                      >
                        <RefreshCw className={syncing === c.id ? "size-3.5 animate-spin" : "size-3.5"} />
                        {syncing === c.id ? "Synchronisation…" : "Synchroniser"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => handleDelete(c)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="border-t pt-3 text-xs">
                    <p className="text-muted-foreground mb-1">{fmtDateTime(c.last_synced_at)}</p>
                    {s && !s.error && (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <CircleCheck className="size-3.5 text-good" />
                        {s.fetched ?? 0} récupéré(s) · {s.created ?? 0} créé(s) · {s.synced ?? 0}{" "}
                        synchronisé(s) · {s.deactivated ?? 0} désactivé(s)
                        {s.errors ? ` · ${s.errors} erreur(s)` : ""}
                      </p>
                    )}
                    {s?.error && (
                      <p className="flex items-center gap-1.5 text-bad">
                        <CircleX className="size-3.5" />
                        {s.error}
                      </p>
                    )}
                    {s?.accounting && !s.accounting.error && (
                      <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                        <CircleCheck className="size-3.5 text-good" />
                        Masse salariale {s.accounting.period} : {s.accounting.fetched ?? 0} écriture(s)
                      </p>
                    )}
                    {s?.accounting?.error && (
                      <p className="mt-1 flex items-center gap-1.5 text-bad">
                        <CircleX className="size-3.5" />
                        Masse salariale : {s.accounting.error}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PayfitCompanyDialog company={editing} onClose={() => setEditing(undefined)} onSaved={load} />

      <div className="mt-8">
        <p className="text-muted-foreground mb-3 text-sm">Doublons potentiels</p>
        <DuplicatesSection />
      </div>
    </div>
  );
}
