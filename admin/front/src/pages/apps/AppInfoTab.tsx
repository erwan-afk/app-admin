import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";
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

const NO_ENV = "__none__";

export function AppInfoTab({ app, onSaved }: { app: AppDetail; onSaved: () => void }) {
  const [name, setName] = useState(app.name);
  const [slug, setSlug] = useState(app.id);
  const [description, setDescription] = useState(app.description || "");
  const [redirect, setRedirect] = useState(app.redirect_uri || "");
  const [publicUrl, setPublicUrl] = useState(app.public_url || "");
  const [active, setActive] = useState(String(app.active));
  const [environment, setEnvironment] = useState(app.environment ?? NO_ENV);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  // Le secret est une option avancée pour une app (flux confidentiel server-side) :
  // par défaut une app est publique/PKCE et n'en a pas besoin. Déplié d'office si un
  // secret existe déjà, pour ne pas cacher une clé active.
  const [showSecurity, setShowSecurity] = useState(app.has_secret);

  // `type` n'est pas une colonne : AppController::deriveType() le recalcule à
  // chaque lecture et renvoie « service » dès qu'un client est confidentiel SANS
  // redirect_uri. Or générer une clé force is_confidential=1 côté serveur. Sur une
  // app dont l'URL du broker est vide, ce bouton faisait donc basculer l'app dans
  // /services, d'où elle ne pouvait plus revenir (ServiceInfoTab n'exposait pas de
  // champ redirect_uri) — piège vécu en prod le 2026-09-08 sur « spreadr-admin ».
  // Exiger l'URL *enregistrée* d'abord rend ce basculement impossible.
  const redirectSaved = (app.redirect_uri ?? "").trim() !== "";

  async function handleRegenerateSecret() {
    if (!redirectSaved) {
      toast.error(
        redirect.trim() !== ""
          ? "Enregistrez d'abord l'URL du broker : sans elle, l'application basculerait dans Services."
          : "Renseignez l'URL du broker, puis Enregistrer, avant de générer une clé : sans elle, l'application basculerait dans Services.",
      );
      return;
    }

    const warning = app.has_secret
      ? `Régénérer la clé secrète de « ${app.name} » ? L'ancienne clé cessera de fonctionner immédiatement — toute intégration qui l'utilise devra être mise à jour.`
      : `Générer une clé secrète pour « ${app.name} » ? Cette application deviendra un client OAuth2 confidentiel.`;
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
        redirect_uri: redirect,
        public_url: publicUrl,
        active: parseInt(active),
        environment: environment === NO_ENV ? null : environment,
      });
      toast.success("Application mise à jour");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="app-name">Nom</Label>
          <Input id="app-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="app-slug">Slug</Label>
          <Input
            id="app-slug"
            required
            pattern="[a-z0-9-]+"
            title="Minuscules, chiffres et tirets uniquement"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="app-desc">Description</Label>
          <Textarea id="app-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="app-redirect">URL du broker (redirect_uri)</Label>
          <Input
            id="app-redirect"
            type="url"
            placeholder="https://…/callback"
            value={redirect}
            onChange={(e) => setRedirect(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="app-public-url">URL publique (site réel, affiché sur Architecture)</Label>
          <Input
            id="app-public-url"
            type="url"
            placeholder="https://…"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
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
          <div className="space-y-1.5">
            <Label>Environnement</Label>
            <Select value={environment} onValueChange={setEnvironment}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="— Aucun —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ENV}>— Aucun —</SelectItem>
                <SelectItem value="prod">Prod</SelectItem>
                <SelectItem value="preprod">Preprod</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={saving}>
          Enregistrer
        </Button>
      </form>

      <div className="rounded-lg border">
        <button
          type="button"
          onClick={() => setShowSecurity((v) => !v)}
          className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left"
        >
          <KeyRound className="text-muted-foreground size-4" />
          <h3 className="text-sm font-medium">Sécurité OAuth2 (avancé)</h3>
          <Badge variant={app.has_secret ? "secondary" : "outline"} className="ml-auto">
            {app.has_secret ? "Confidentiel (clé secrète active)" : "Public (PKCE, sans clé secrète)"}
          </Badge>
          <ChevronDown className={`text-muted-foreground size-4 transition-transform ${showSecurity ? "rotate-180" : ""}`} />
        </button>
        {showSecurity && (
          <div className="space-y-3 border-t p-4">
            <p className="text-muted-foreground text-sm">
              La plupart des applications sont publiques (PKCE) et n'ont pas besoin de clé. Une clé
              secrète n'est utile qu'en flux confidentiel (échange de code côté serveur). Elle n'est
              jamais stockée en clair et n'est affichée qu'une seule fois, immédiatement après
              régénération. Pour un appel d'application à application sans utilisateur, créez plutôt
              un <strong>Service</strong>.
            </p>
            {!redirectSaved && (
              <p className="flex items-start gap-1.5 text-sm text-amber-600 dark:text-amber-500">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  Renseignez d'abord l'<strong>URL du broker</strong> ci-dessus et enregistrez. Une
                  clé secrète rend le client confidentiel : sans URL de retour, il serait reclassé
                  comme <strong>Service</strong> et quitterait cette section.
                </span>
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={regenerating || !redirectSaved}
              onClick={handleRegenerateSecret}
            >
              <RefreshCw className="size-4" />
              {app.has_secret ? "Régénérer la clé secrète" : "Générer une clé secrète"}
            </Button>
          </div>
        )}
      </div>

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
