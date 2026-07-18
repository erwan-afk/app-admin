import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
 * Onglet Informations d'un nœud externe (diagramme-only, ex: hubspot).
 * Un externe ne s'authentifie jamais via auth_global : ni redirect_uri, ni
 * clé secrète, ni rôles/permissions. On n'édite que ce qui sert au diagramme
 * Architecture : nom, description et URL publique (le lien affiché sur la carte).
 */
export function ExternalInfoTab({ app, onSaved }: { app: AppDetail; onSaved: () => void }) {
  const [name, setName] = useState(app.name);
  const [slug, setSlug] = useState(app.id);
  const [description, setDescription] = useState(app.description || "");
  const [publicUrl, setPublicUrl] = useState(app.public_url || "");
  const [active, setActive] = useState(String(app.active));
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("update_app", {
        id: app.id,
        name,
        slug,
        description,
        public_url: publicUrl,
        active: parseInt(active),
      });
      toast.success("Système externe mis à jour");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
        Système externe : il ne s'authentifie jamais via auth_global. Ce nœud n'existe que pour le
        diagramme <strong>Architecture</strong> (position et connexions se règlent là-bas).
      </p>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ext-name">Nom</Label>
          <Input id="ext-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ext-slug">Slug (identifiant du nœud)</Label>
          <Input
            id="ext-slug"
            required
            pattern="[a-z0-9-]+"
            title="Minuscules, chiffres et tirets uniquement"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ext-desc">Description</Label>
          <Textarea id="ext-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ext-public-url">URL publique (lien affiché sur la carte)</Label>
          <Input
            id="ext-public-url"
            type="url"
            placeholder="https://…"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
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
        <Button type="submit" disabled={saving}>
          Enregistrer
        </Button>
      </form>
    </div>
  );
}
