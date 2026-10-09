import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Crown,
  Mail,
  Phone,
  ShieldCheck,
  ShieldAlert,
  Pencil,
  Trash2,
  KeyRound,
  Copy,
  Plus,
  X,
  LogOut,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { euros, MONTHS_FR } from "@/lib/format";
import { type AppCatalog, computeAccess } from "./access";
import type { UserDetail, UserDetailResponse } from "./types";

interface Props {
  userId: number;
  onEdit: () => void;
  onDeleted: () => void;
}

function initials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

/**
 * Signale une adresse professionnelle qui n'est pas fiable — provenance
 * `email_source` posée par auth_global (migration 051).
 *
 * `derived` et `placeholder` sont les deux cas où l'adresse ne correspond à
 * aucune boîte réelle : la personne ne reçoit rien, ne peut pas se connecter, et
 * son CA ne peut pas être rapproché de `report` (la jointure se fait sur
 * l'email). C'est resté invisible jusqu'au 2026-08-05, où 3 adresses inventées
 * cachaient 49 130 € de CA — d'où ce badge.
 *
 * `payfit` et `manual` sont des états normaux : rien à afficher, on ne décore
 * pas ce qui va bien.
 */
function EmailSourceBadge({ source }: { source: UserDetail["email_source"] }) {
  if (source === "placeholder") {
    return (
      <Badge variant="destructive" title="Aucune adresse exploitable : la synchro a posé une adresse technique non routable. Cette personne ne peut pas se connecter — renseigner son email professionnel dans Payfit.">
        connexion impossible
      </Badge>
    );
  }
  if (source === "derived") {
    return (
      <Badge variant="secondary" title="Adresse devinée depuis le nom (initiale + nom), faute d'email professionnel dans Payfit. Plausible mais non vérifiée : si elle ne correspond à aucune boîte, le CA de cette personne n'est pas rapproché de report. Renseigner Payfit remplacera l'adresse à la resynchro.">
        adresse devinée
      </Badge>
    );
  }
  return null;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  // auth_global écrit ces dates en heure serveur (UTC) au format naïf
  // "YYYY-MM-DD HH:MM:SS", sans fuseau : `new Date()` les lirait comme
  // heure locale du navigateur et n'appliquerait aucun décalage.
  const naive = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(d);
  const date = new Date(naive ? `${d.replace(" ", "T")}Z` : d);
  return date.toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
}

function fmtPeriod(period: string): string {
  const y = period.slice(0, 4);
  const m = Number(period.slice(4, 6));
  return `${MONTHS_FR[m - 1]} ${y}`;
}

/** Ancienneté en années + mois depuis hire_date, jusqu'à disabled_at si sorti. */
function tenure(hireDate: string | null, disabledAt: string | null): string {
  if (!hireDate) return "—";
  const start = new Date(hireDate);
  const end = disabledAt ? new Date(disabledAt) : new Date();
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mois`;
  if (rem === 0) return `${years} an${years > 1 ? "s" : ""}`;
  return `${years} an${years > 1 ? "s" : ""} et ${rem} mois`;
}

/** Profil employé en lecture (panneau droit du master-detail Utilisateurs).
 *  Les mutations (champs cœur, mot de passe, rôles/permissions, assignations)
 *  restent dans UserFormDialog — ce composant ne fait qu'afficher, "Modifier"
 *  rouvre le dialog existant sur cet id. */
export function UserProfile({ userId, onEdit, onDeleted }: Props) {
  const [data, setData] = useState<UserDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [newProEmail, setNewProEmail] = useState("");
  const [newProEmailLabel, setNewProEmailLabel] = useState("");
  const [addingProEmail, setAddingProEmail] = useState(false);
  const [catalog, setCatalog] = useState<AppCatalog[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<UserDetailResponse>(`user&id=${userId}`));
      // Catalogue des profils et permissions : sert à calculer l'accès effectif. Sans lui, on affiche ce qu'on a.
      api
        .get<AppCatalog[]>("apps_with_roles")
        .then(setCatalog)
        .catch(() => setCatalog([]));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!data) return;
    const name = `${data.user.first_name} ${data.user.last_name}`;
    if (!confirm(`Supprimer l'utilisateur « ${name} » ?`)) return;
    try {
      await api.del("delete_user", { id: userId });
      toast.success("Utilisateur supprimé");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function handleRegeneratePassword() {
    if (!data) return;
    const name = `${data.user.first_name} ${data.user.last_name}`;
    if (!confirm(`Régénérer le mot de passe de « ${name} » ? L'ancien cessera de fonctionner.`)) return;
    setRegenerating(true);
    try {
      const res = await api.post<{ password: string }>("regenerate_user_password", { id: userId });
      setRevealedPassword(res.password);
      toast.success("Mot de passe régénéré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleRevokeTokens() {
    if (!data) return;
    const name = `${data.user.first_name} ${data.user.last_name}`;
    if (
      !confirm(
        `Déconnecter « ${name} » de toutes les apps ? Sa session en cours sera invalidée immédiatement, sans désactiver le compte.`,
      )
    )
      return;
    setRevoking(true);
    try {
      await api.post("revoke_user_tokens", { id: userId });
      toast.success("Session(s) révoquée(s)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setRevoking(false);
    }
  }

  async function copyPassword() {
    if (!revealedPassword) return;
    try {
      await navigator.clipboard.writeText(revealedPassword);
      toast.success("Mot de passe copié dans le presse-papiers");
    } catch {
      toast.error("Copie impossible — sélectionnez et copiez manuellement");
    }
  }

  async function handleAddProEmail() {
    const email = newProEmail.trim();
    if (!email) return;
    setAddingProEmail(true);
    try {
      await api.post("create_user_pro_email", {
        id: userId,
        email,
        label: newProEmailLabel.trim() || undefined,
      });
      setNewProEmail("");
      setNewProEmailLabel("");
      toast.success("Adresse ajoutée");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAddingProEmail(false);
    }
  }

  async function handleDisableProEmail(proEmailId: number, email: string) {
    if (!confirm(`Désactiver l'adresse « ${email} » ?`)) return;
    try {
      await api.del("delete_user_pro_email", { id: userId, pro_email_id: proEmailId });
      toast.success("Adresse désactivée");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) return null;

  const { user, credentials, assignments, app_roles, app_grants, payfit_cost, pro_emails } = data;
  const activeProEmails = pro_emails.filter((p) => p.active === 1);
  const primary = assignments.find((a) => a.is_primary === 1 && !a.valid_until) ?? assignments[0];

  const access = computeAccess(catalog, app_roles, app_grants);

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            {user.photo && <AvatarImage src={user.photo} alt="" />}
            <AvatarFallback className="text-lg font-medium">
              {initials(user.first_name, user.last_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">
                {user.first_name} {user.last_name}
              </h1>
              {user.is_codir === 1 && (
                <Badge variant="secondary" className="gap-1">
                  <Crown className="size-3" /> Codir
                </Badge>
              )}
              {user.active === 1 ? (
                <Badge variant="secondary">Actif</Badge>
              ) : (
                <Badge variant="outline">Inactif</Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {[primary?.grade, primary?.node_name].filter(Boolean).join(" · ") || "Non affecté"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" /> Modifier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={handleDelete}
          >
            <Trash2 className="size-3.5" /> Supprimer
          </Button>
        </div>
      </div>

      <Tabs defaultValue="identite">
        {/* variant="line" (soulignement) plutôt que le pill par défaut : avec
            5 libellés dont certains longs, le pill par défaut n'offre aucune
            séparation visuelle entre onglets inactifs (seul l'actif a un
            fond) — illisible à cette densité, cf. retour Ethibaud
            "j'arrive pas à les distinguer, tout est collé" (2026-07-19). */}
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="identite">Identité</TabsTrigger>
          <TabsTrigger value="poste">Poste & Organisation</TabsTrigger>
          <TabsTrigger value="rh">RH · Payfit</TabsTrigger>
          <TabsTrigger value="acces">Accès applicatifs</TabsTrigger>
          <TabsTrigger value="securite">Sécurité</TabsTrigger>
        </TabsList>

        {/* Identité */}
        <TabsContent value="identite" className="mt-4">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 p-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Email professionnel</p>
                <p className="flex flex-wrap items-center gap-1.5 font-medium">
                  <Mail className="size-3.5" /> {user.email}
                  <EmailSourceBadge source={user.email_source} />
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Email personnel</p>
                <p className="flex items-center gap-1.5 font-medium">
                  <Phone className="size-3.5" /> {user.email_perso || "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Date d'embauche</p>
                <p className="font-medium">{fmtDate(user.hire_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">
                  {user.disabled_at ? "Date de sortie" : "Ancienneté"}
                </p>
                <p className="font-medium">
                  {user.disabled_at
                    ? fmtDate(user.disabled_at)
                    : tenure(user.hire_date, user.disabled_at)}
                </p>
              </div>
              <div className="col-span-2 border-t pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={regenerating}
                  onClick={handleRegeneratePassword}
                >
                  <KeyRound className="size-3.5" /> Régénérer le mot de passe
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-3">
            <CardContent className="space-y-3 p-4 text-sm">
              <div>
                <p className="font-medium">Adresses professionnelles secondaires</p>
                <p className="text-muted-foreground text-xs">
                  Adresses que cette personne utilise aussi. Servent à rapprocher son chiffre
                  d'affaires de report ; son identifiant de connexion ne change pas.
                </p>
              </div>

              {activeProEmails.length > 0 && (
                <div className="space-y-1.5">
                  {activeProEmails.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1 break-all font-mono text-xs">
                        {p.email}
                        {p.label && (
                          <span className="text-muted-foreground ml-1.5 font-sans">
                            ({p.label})
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground hover:text-red-600"
                        onClick={() => handleDisableProEmail(p.id, p.email)}
                        aria-label="Désactiver"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 border-t pt-3">
                <Input
                  placeholder="adresse@exemple.com"
                  value={newProEmail}
                  onChange={(e) => setNewProEmail(e.target.value)}
                  className="text-xs"
                />
                <Input
                  placeholder="label (optionnel)"
                  value={newProEmailLabel}
                  onChange={(e) => setNewProEmailLabel(e.target.value)}
                  className="w-32 text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={addingProEmail || !newProEmail.trim()}
                  onClick={handleAddProEmail}
                  className="shrink-0"
                >
                  <Plus className="size-3.5" /> Ajouter
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Poste & Organisation */}
        <TabsContent value="poste" className="mt-4 space-y-3">
          {assignments.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune assignation.</p>
          ) : (
            assignments.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex items-center justify-between p-4 text-sm">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{a.node_name}</span>
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {a.node_type}
                      </Badge>
                      {a.is_primary === 1 && !a.valid_until && (
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          Principal
                        </Badge>
                      )}
                      {a.is_node_manager === 1 && (
                        <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                          <Crown className="size-3" /> Responsable
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {a.grade ? `${a.grade} · ` : ""}
                      depuis le {fmtDate(a.valid_from)}
                      {a.valid_until ? ` · clôturée le ${fmtDate(a.valid_until)}` : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* RH · Payfit */}
        <TabsContent value="rh" className="mt-4 space-y-3">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 p-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Matricule</p>
                <p className="font-medium">{user.matricule || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Équipe Payfit</p>
                <p className="font-medium">{user.team_name || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs">Statut contrat</p>
                <p className="font-medium">
                  {user.payfit_id
                    ? user.disabled_at
                      ? "Sorti (Payfit)"
                      : "Actif (synchronisé Payfit)"
                    : "Compte manuel (pas de contrat Payfit)"}
                </p>
              </div>
            </CardContent>
          </Card>

          {payfit_cost && (
            <Card>
              <CardContent className="p-4 text-sm">
                <p className="text-muted-foreground text-xs">
                  Coût employeur mensuel — {fmtPeriod(payfit_cost.period)}
                </p>
                <p className="text-lg font-semibold">{euros(payfit_cost.net, 2)}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Coût total employeur (charges patronales comprises), pas le salaire net versé
                  au collaborateur — calculé depuis le grand livre Payfit (comptes de charge
                  classe 6).
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Accès applicatifs */}
        <TabsContent value="acces" className="mt-4 space-y-3">
          {access.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun accès applicatif.</p>
          ) : (
            access.map((app) => (
              <Card key={app.appId}>
                <CardContent className="space-y-3 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{app.appName}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      Profil
                      {app.profiles.length > 0 ? (
                        app.profiles.map((r) => (
                          <Badge key={r.id} variant="secondary">
                            {r.role_label}
                          </Badge>
                        ))
                      ) : (
                        <span className="italic">aucun (droits individuels)</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">
                      Accès effectif — ce que l'application reçoit
                    </p>
                    {app.permissions.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">Aucune permission.</p>
                    ) : (
                      <ul className="space-y-1">
                        {app.permissions.map((p) => (
                          <li key={p.name} className="flex flex-wrap items-center gap-2">
                            <span>{p.label}</span>
                            {p.viaProfiles.map((v) => (
                              <Badge key={v} variant="outline" className="px-1 py-0 text-[10px] font-normal">
                                via {v}
                              </Badge>
                            ))}
                            {p.direct && (
                              <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal">
                                droit direct
                              </Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {app.denied.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {app.denied.map((d) => (
                        <Badge key={d.name} variant="destructive">
                          {d.label} — refusé
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Sécurité */}
        <TabsContent value="securite" className="mt-4">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 p-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Statut du compte</p>
                <p className="flex items-center gap-1.5 font-medium">
                  {credentials?.creation_status === "activated" ? (
                    <ShieldCheck className="size-3.5 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="size-3.5 text-muted-foreground" />
                  )}
                  {credentials?.creation_status === "activated"
                    ? "Activé"
                    : credentials?.creation_status === "created"
                      ? "Créé, jamais connecté"
                      : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Dernière connexion</p>
                <p className="font-medium">{fmtDateTime(credentials?.last_login_at ?? null)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Tentatives échouées</p>
                <p className="font-medium">{credentials?.failed_login_attempts ?? 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Verrouillé jusqu'à</p>
                <p className="font-medium">{fmtDateTime(credentials?.locked_until ?? null)}</p>
              </div>
              <div className="col-span-2 border-t pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={revoking}
                  onClick={handleRevokeTokens}
                >
                  <LogOut className="size-3.5" /> Déconnecter de toutes les apps
                </Button>
                <p className="text-muted-foreground mt-1.5 text-xs">
                  Invalide immédiatement toutes les sessions actives (toutes apps confondues) sans
                  désactiver le compte.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={revealedPassword !== null} onOpenChange={(o) => !o && setRevealedPassword(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau mot de passe généré</DialogTitle>
            <DialogDescription>
              Copiez-le maintenant : il ne sera plus jamais affiché. Transmettez-le à la personne
              uniquement si elle ne peut pas utiliser la connexion Google.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={revealedPassword ?? ""}
              className="font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={copyPassword}
              aria-label="Copier le mot de passe"
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setRevealedPassword(null)}>
              J'ai copié le mot de passe, fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
