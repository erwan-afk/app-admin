import { useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { AppDetail } from "./types";

/**
 * Onglet Informations d'un client de service (client_credentials, app-à-app).
 * Contrairement à une application utilisateur, un service n'a ni redirect_uri,
 * ni rôles/permissions (pas d'utilisateurs) : sa raison d'être est la clé secrète.
 */
export function ServiceInfoTab({ app, onSaved }: { app: AppDetail; onSaved: () => void }) {
  const [name, setName] = useState(app.name);
  const [slug, setSlug] = useState(app.id);
  const [description, setDescription] = useState(app.description || "");
  const [structureId, setStructureId] = useState(
    app.structure_id !== null ? String(app.structure_id) : "",
  );
  const [active, setActive] = useState(String(app.active));
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  async function handleRegenerateSecret() {
    const warning = app.has_secret
      ? `Régénérer la clé secrète de « ${app.name} » ? L'ancienne clé cessera de fonctionner immédiatement — toute intégration qui l'utilise devra être mise à jour.`
      : `Générer une clé secrète pour « ${app.name} » ?`;
    if (!confirm(warning)) return;

    setRegenerating(true);
    try {
      const res = await api.post<{ secret: string }>("regenerate_app_secret", { id: app.id });
      setRevealedSecret(res.secret);
      toast.success("Clé secrète régénérée");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setRegenerating(false);
    }
  }

  async function copySecret() {
    if (!revealedSecret) return;
    try {
      await navigator.clipboard.writeText(revealedSecret);
      toast.success("Clé copiée dans le presse-papiers");
    } catch {
      toast.error("Copie impossible — sélectionnez et copiez manuellement");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("update_app", {
        id: app.id,
        name,
        slug,
        description,
        structure_id: structureId.trim() === "" ? null : parseInt(structureId, 10),
        active: parseInt(active),
      });
      toast.success("Service mis à jour");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* La clé secrète : cœur d'un client de service, mise en avant en premier. */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="text-muted-foreground size-4" />
          <h3 className="text-sm font-medium">Clé secrète (client_credentials)</h3>
          <Badge variant={app.has_secret ? "secondary" : "destructive"} className="ml-auto">
            {app.has_secret ? "Clé active" : "Aucune clé"}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Ce service s'authentifie auprès du serveur OAuth2 en flux{" "}
          <code className="text-xs">client_credentials</code> (appels d'application à application,
          sans utilisateur). La clé n'est jamais stockée en clair et n'est affichée qu'une seule
          fois, immédiatement après régénération.
        </p>
        {!app.has_secret && (
          <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-500">
            <ShieldAlert className="size-4" />
            Ce service n'a pas de clé : il ne peut pas encore s'authentifier.
          </p>
        )}
        <Button type="button" variant="outline" disabled={regenerating} onClick={handleRegenerateSecret}>
          <RefreshCw className="size-4" />
          {app.has_secret ? "Régénérer la clé secrète" : "Générer une clé secrète"}
        </Button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="svc-name">Nom</Label>
          <Input id="svc-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="svc-slug">Slug (client_id)</Label>
          <Input
            id="svc-slug"
            required
            pattern="[a-z0-9-]+"
            title="Minuscules, chiffres et tirets uniquement"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="svc-desc">Description</Label>
          <Textarea id="svc-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="svc-structure">Structure (id, optionnel)</Label>
            <Input
              id="svc-structure"
              type="number"
              placeholder="—"
              value={structureId}
              onChange={(e) => setStructureId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Actif</Label>
            <Select value={active} onValueChange={setActive}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Oui</SelectItem>
                <SelectItem value="0">Non</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={saving}>
          Enregistrer
        </Button>
      </form>

      <Dialog open={revealedSecret !== null} onOpenChange={(o) => !o && setRevealedSecret(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle clé secrète générée</DialogTitle>
            <DialogDescription>
              Copiez cette clé maintenant : elle ne sera plus jamais affichée. Stockez-la dans un
              gestionnaire de secrets (elle remplace immédiatement l'ancienne).
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={revealedSecret ?? ""}
              className="font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <Button type="button" size="icon" variant="outline" onClick={copySecret} aria-label="Copier la clé secrète">
              <Copy className="size-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setRevealedSecret(null)}>
              J'ai copié la clé, fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
