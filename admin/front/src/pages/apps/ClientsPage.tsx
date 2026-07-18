import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, AppWindow, Server, Cloud, Copy, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { AppDetail, AppListItem, AppPermission, ClientKind } from "./types";
import { AppInfoTab } from "./AppInfoTab";
import { AppRolesTab } from "./AppRolesTab";
import { AppPermsTab } from "./AppPermsTab";
import { ServiceInfoTab } from "./ServiceInfoTab";
import { ExternalInfoTab } from "./ExternalInfoTab";

interface KindConfig {
  title: string;
  icon: LucideIcon;
  countLabel: (n: number, active: number) => string;
  emptyText: string;
}

const KIND_CONFIG: Record<ClientKind, KindConfig> = {
  app: {
    title: "Applications",
    icon: AppWindow,
    countLabel: (n, active) => `${n} apps · ${active} actives`,
    emptyText: "Sélectionnez une application",
  },
  service: {
    title: "Services",
    icon: Server,
    countLabel: (n, active) => `${n} services · ${active} actifs`,
    emptyText: "Sélectionnez un service",
  },
  external: {
    title: "Externes",
    icon: Cloud,
    countLabel: (n, active) => `${n} externes · ${active} actifs`,
    emptyText: "Sélectionnez un système externe",
  },
};

export function ClientsPage({ kind }: { kind: ClientKind }) {
  const cfg = KIND_CONFIG[kind];
  const EmptyIcon = cfg.icon;
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AppDetail | null>(null);
  const [perms, setPerms] = useState<AppPermission[]>([]);
  const [creating, setCreating] = useState(false);

  const loadApps = useCallback(async () => {
    try {
      const all = await api.get<AppListItem[]>("apps");
      setApps(all.filter((a) => a.type === kind));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    }
  }, [kind]);

  const loadDetail = useCallback(
    async (id: string) => {
      try {
        if (kind === "app") {
          const [app, p] = await Promise.all([
            api.get<AppDetail>(`app&id=${id}`),
            api.get<AppPermission[]>(`permissions&app_id=${id}`),
          ]);
          setDetail(app);
          setPerms(p);
        } else {
          setDetail(await api.get<AppDetail>(`app&id=${id}`));
          setPerms([]);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur de chargement");
      }
    },
    [kind],
  );

  useEffect(() => {
    // Repartir de zéro quand on change de section (app <-> service).
    setSelected(null);
    setDetail(null);
    setSearch("");
    loadApps();
  }, [loadApps]);

  useEffect(() => {
    if (selected) loadDetail(selected);
    else setDetail(null);
  }, [selected, loadDetail]);

  async function disableClient() {
    if (!detail) return;
    if (!confirm(`Désactiver « ${detail.name} » ?`)) return;
    try {
      await api.del("delete_app", { id: detail.id });
      toast.success("Désactivé");
      setSelected(null);
      loadApps();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  const refreshDetail = () => {
    if (selected) loadDetail(selected);
    loadApps();
  };

  const onCreated = (id: string) => {
    setCreating(false);
    loadApps();
    setSelected(id);
  };

  const visible = apps.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));
  const activeCount = apps.filter((a) => a.active === 1).length;

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Liste */}
      <aside className="flex w-64 shrink-0 flex-col border-r">
        <div className="space-y-2 border-b p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{cfg.title}</span>
            <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
            </Button>
          </div>
          <Input
            placeholder="Filtrer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
          <p className="text-muted-foreground text-xs">{cfg.countLabel(apps.length, activeCount)}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {visible.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                selected === a.id ? "bg-secondary" : "hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  a.active === 1 ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
              />
              <span className="flex-1 truncate">{a.name}</span>
              {kind === "app" && (
                <span className="text-muted-foreground text-xs">{a.role_count}</span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Détail */}
      <div className="flex-1 overflow-y-auto p-6">
        {!detail ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
            <EmptyIcon className="size-10 opacity-30" />
            <p>{cfg.emptyText}</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <h1 className="text-xl font-semibold">{detail.name}</h1>
              <Badge variant="outline" className="font-mono">{detail.id}</Badge>
              <Badge variant={detail.active === 1 ? "secondary" : "outline"}>
                {detail.active === 1 ? "Actif" : "Inactif"}
              </Badge>
              <Button variant="destructive" size="sm" className="ml-auto" onClick={disableClient}>
                Désactiver
              </Button>
            </div>

            {kind === "app" ? (
              <Tabs defaultValue="info" key={detail.id}>
                <TabsList>
                  <TabsTrigger value="info">Informations</TabsTrigger>
                  <TabsTrigger value="roles">Rôles</TabsTrigger>
                  <TabsTrigger value="perms">Permissions</TabsTrigger>
                </TabsList>
                <TabsContent value="info" className="mt-4">
                  <AppInfoTab app={detail} onSaved={refreshDetail} />
                </TabsContent>
                <TabsContent value="roles" className="mt-4">
                  <AppRolesTab app={detail} perms={perms} onChanged={refreshDetail} />
                </TabsContent>
                <TabsContent value="perms" className="mt-4">
                  <AppPermsTab app={detail} perms={perms} onChanged={refreshDetail} />
                </TabsContent>
              </Tabs>
            ) : kind === "service" ? (
              <ServiceInfoTab app={detail} onSaved={refreshDetail} />
            ) : (
              <ExternalInfoTab app={detail} onSaved={refreshDetail} />
            )}
          </>
        )}
      </div>

      {kind === "app" ? (
        <CreateAppDialog open={creating} onClose={() => setCreating(false)} onCreated={onCreated} />
      ) : kind === "service" ? (
        <CreateServiceDialog open={creating} onClose={() => setCreating(false)} onCreated={onCreated} />
      ) : (
        <CreateExternalDialog open={creating} onClose={() => setCreating(false)} onCreated={onCreated} />
      )}
    </div>
  );
}

function CreateAppDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>("create_app", { name, slug });
      toast.success("Application créée");
      setName("");
      setSlug("");
      onCreated(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nouvelle application</DialogTitle>
          <DialogDescription>
            Client OAuth2 public (PKCE) pour une application utilisateur. Renseignez ensuite l'URL
            de callback dans l'onglet Informations.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-app-name">Nom</Label>
            <Input id="new-app-name" required placeholder="ex: Team Media-Start" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-app-slug">Slug</Label>
            <Input id="new-app-slug" required pattern="[a-z0-9-]+" placeholder="ex: team" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>Créer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Création d'un client de service (client_credentials) : crée le client confidentiel
 * sans redirect_uri, puis génère et révèle immédiatement sa clé secrète (2 appels).
 */
function CreateServiceDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<{ id: string; secret: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>("create_app", {
        name,
        slug,
        is_confidential: 1,
        pkce_required: 0,
        redirect_uri: "",
      });
      const sec = await api.post<{ secret: string }>("regenerate_app_secret", { id: res.id });
      setCreatedSecret({ id: res.id, secret: sec.secret });
      toast.success("Service créé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function copySecret() {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret.secret);
      toast.success("Clé copiée dans le presse-papiers");
    } catch {
      toast.error("Copie impossible — sélectionnez et copiez manuellement");
    }
  }

  function finish() {
    const id = createdSecret?.id;
    setCreatedSecret(null);
    setName("");
    setSlug("");
    if (id) onCreated(id);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          if (createdSecret) finish();
          else onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {!createdSecret ? (
          <>
            <DialogHeader>
              <DialogTitle>Nouveau service</DialogTitle>
              <DialogDescription>
                Client OAuth2 confidentiel (flux <code className="text-xs">client_credentials</code>,
                appels d'application à application). Une clé secrète sera générée et affichée une
                seule fois à la création.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-svc-name">Nom</Label>
                <Input id="new-svc-name" required placeholder="ex: Report Service" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-svc-slug">Slug (client_id)</Label>
                <Input id="new-svc-slug" required pattern="[a-z0-9-]+" placeholder="ex: report-service" value={slug} onChange={(e) => setSlug(e.target.value)} />
                <p className="text-muted-foreground text-xs">Convention : suffixe <code>-service</code>.</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
                <Button type="submit" disabled={saving}>Créer</Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Service « {createdSecret.id} » créé</DialogTitle>
              <DialogDescription>
                Copiez cette clé secrète maintenant : elle ne sera plus jamais affichée. Stockez-la
                dans un gestionnaire de secrets.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={createdSecret.secret}
                className="font-mono text-xs"
                onFocus={(e) => e.target.select()}
              />
              <Button type="button" size="icon" variant="outline" onClick={copySecret} aria-label="Copier la clé secrète">
                <Copy className="size-4" />
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={finish}>J'ai copié la clé, fermer</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Création d'un nœud externe (diagramme-only) : client non confidentiel, sans
 * redirect_uri, marqué is_external=1 — il ne s'authentifie jamais via auth_global.
 */
function CreateExternalDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>("create_app", {
        name,
        slug,
        public_url: publicUrl,
        is_external: 1,
        is_confidential: 0,
        redirect_uri: "",
      });
      toast.success("Système externe créé");
      setName("");
      setSlug("");
      setPublicUrl("");
      onCreated(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nouveau système externe</DialogTitle>
          <DialogDescription>
            Nœud de diagramme pour un système qui ne s'authentifie pas via auth_global (ex: un CRM
            externe). Apparaîtra sur la page Architecture.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-ext-name">Nom</Label>
            <Input id="new-ext-name" required placeholder="ex: HubSpot" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-ext-slug">Slug</Label>
            <Input id="new-ext-slug" required pattern="[a-z0-9-]+" placeholder="ex: hubspot" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-ext-url">URL publique</Label>
            <Input id="new-ext-url" type="url" placeholder="https://…" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>Créer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
