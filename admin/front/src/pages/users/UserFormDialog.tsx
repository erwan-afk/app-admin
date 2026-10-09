import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type {
  UserDetailResponse,
  UserFormValues,
  AppRole,
  AdminPermission,
} from "./types";
import type { Grade } from "./types";

const today = new Date().toISOString().split("T")[0];
const NO_GRADE = "__none__";

interface AppWithRoles {
  id: string;
  name: string;
  roles: { id: number; name: string; label: string; permissions: AdminPermission[] }[];
  permissions: AdminPermission[];
}

const EMPTY: UserFormValues = {
  first_name: "",
  last_name: "",
  email: "",
  hire_date: today,
  email_perso: "",
  is_codir: 0,
  active: 1,
};

interface Props {
  /** id pour éditer, null pour créer, undefined = fermé */
  userId: number | null | undefined;
  onClose: () => void;
  onSaved: () => void;
}

export function UserFormDialog({ userId, onClose, onSaved }: Props) {
  const open = userId !== undefined;
  const isEdit = typeof userId === "number";

  const [values, setValues] = useState<UserFormValues>(EMPTY);
  const [assignments, setAssignments] = useState<
    UserDetailResponse["assignments"]
  >([]);
  const [appRoles, setAppRoles] = useState<AppRole[]>([]);
  const [appGrants, setAppGrants] = useState<UserDetailResponse["app_grants"]>(
    [],
  );
  const [apps, setApps] = useState<AppWithRoles[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permSaving, setPermSaving] = useState<string | null>(null);
  const [roleAction, setRoleAction] = useState<{
    appId: string;
    type: "assign" | "revoke";
    roleId?: number;
    assignmentId?: number;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [gradeSaving, setGradeSaving] = useState<number | null>(null);

  async function loadUser() {
    if (!isEdit) return;
    const [data, appsData, gradesData] = await Promise.all([
      api.get<UserDetailResponse>(`user&id=${userId}`),
      api.get<any[]>("apps_with_roles"),
      api.get<Grade[]>("grades"),
    ]);
    setGrades(gradesData);
    const u = data.user;
    setValues({
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      hire_date: u.hire_date || "",
      email_perso: u.email_perso || "",
      is_codir: u.is_codir,
      active: u.active,
    });
    setAssignments((data.assignments || []).filter((a) => !a.valid_until));
    setAppRoles(data.app_roles || []);
    setAppGrants(data.app_grants || []);
    setApps(
      appsData.map((a: any) => ({
        id: a.id,
        name: a.name,
        roles: a.roles || [],
        permissions: a.permissions || [],
      })),
    );
  }

  useEffect(() => {
    if (!open) return;
    if (!isEdit) {
      setValues(EMPTY);
      setAssignments([]);
      setAppRoles([]);
      setAppGrants([]);
      setApps([]);
      setPassword("");
      return;
    }
    setLoading(true);
    loadUser()
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [userId, open, isEdit]);

  const set = (k: keyof UserFormValues, v: string | number) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  // ── Mot de passe ──
  async function handleSetPassword() {
    if (!password || !isEdit) return;
    if (password.length < 8) {
      toast.error("8 caracteres minimum");
      return;
    }
    setPasswordSaving(true);
    try {
      await api.put("set_user_password", { id: userId, password });
      toast.success("Mot de passe defini");
      setPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setPasswordSaving(false);
    }
  }

  // ── Permissions par application (grants individuels, additifs OU refus
  // explicite au-dessus du rôle — cf. Server::getUserPermissions() côté
  // auth_global qui soustrait désormais les granted=0) ──
  const directGrant = (appId: string, permName: string) =>
    appGrants.find((g) => g.app_id === appId && g.perm_name === permName);

  const isDenied = (appId: string, permName: string) =>
    directGrant(appId, permName)?.granted === 0;

  const hasGrant = (appId: string, permName: string) =>
    directGrant(appId, permName)?.granted === 1;

  async function togglePerm(appId: string, perm: AdminPermission, viaRole: boolean) {
    if (!isEdit) return;
    const key = `${appId}:${perm.name}`;
    const effective = !isDenied(appId, perm.name) && (viaRole || hasGrant(appId, perm.name));
    setPermSaving(key);
    try {
      if (effective) {
        if (viaRole) {
          // Le rôle l'accorde : un simple "delete" ne suffit pas à la
          // retirer, il faut un refus explicite qui prime dessus.
          await api.post("upsert_app_grant", {
            user_id: userId,
            app_id: appId,
            permission_id: perm.id,
            granted: 0,
            note: "Refusé individuellement depuis la console admin",
          });
          toast.success(`Permission "${perm.label}" refusée pour cet utilisateur`);
        } else {
          await api.del("delete_app_grant", {
            user_id: userId,
            app_id: appId,
            permission_id: perm.id,
          });
          toast.success(`Permission "${perm.label}" retirée`);
        }
      } else if (isDenied(appId, perm.name)) {
        // Retire le refus explicite — la permission redevient ce que le
        // rôle décide (accordée ou non).
        await api.del("delete_app_grant", {
          user_id: userId,
          app_id: appId,
          permission_id: perm.id,
        });
        toast.success(`Refus retiré pour "${perm.label}"`);
      } else {
        await api.post("upsert_app_grant", {
          user_id: userId,
          app_id: appId,
          permission_id: perm.id,
          granted: 1,
          note: "Attribué depuis la console admin",
        });
        toast.success(`Permission "${perm.label}" accordée`);
      }
      await loadUser();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setPermSaving(null);
    }
  }

  // ── Grade d'une assignation ──
  async function updateAssignmentGrade(assignmentId: number, gradeId: string) {
    setGradeSaving(assignmentId);
    try {
      await api.put("set_assignment_grade", {
        assignment_id: assignmentId,
        grade_id: gradeId === NO_GRADE ? undefined : Number(gradeId),
      });
      toast.success("Grade mis à jour");
      await loadUser();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setGradeSaving(null);
    }
  }

  // ── Rôles applicatifs ──
  async function assignRole(appId: string, roleId: number) {
    setRoleAction({ appId, type: "assign", roleId });
    try {
      await api.post("assign_app_role", {
        user_id: userId,
        app_id: appId,
        app_role_id: roleId,
      });
      toast.success("Rôle attribué");
      await loadUser();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRoleAction(null);
    }
  }

  async function revokeRole(assignmentId: number) {
    setRoleAction({ appId: "", type: "revoke", assignmentId });
    try {
      await api.del("revoke_app_role", {
        id: assignmentId,
        user_id: userId,
      });
      toast.success("Rôle révoqué");
      await loadUser();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRoleAction(null);
    }
  }

  // Regroupe les rôles par app
  const rolesByApp: Record<string, AppRole[]> = {};
  for (const r of appRoles) {
    if (!rolesByApp[r.app_id]) rolesByApp[r.app_id] = [];
    rolesByApp[r.app_id].push(r);
  }

  // Une permission est-elle déjà accordée via un des rôles actifs du user
  // sur cette app ? (indépendant des grants individuels, cf. hasGrant)
  const roleGrantsPermission = (appId: string, permName: string) => {
    const app = apps.find((a) => a.id === appId);
    if (!app) return false;
    const userRoleIds = new Set(
      (rolesByApp[appId] || []).map((r) => r.app_role_id),
    );
    return app.roles.some(
      (r) =>
        userRoleIds.has(r.id) &&
        r.permissions.some((p) => p.name === permName),
    );
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await api.put("update_user", { ...values, id: userId });
        toast.success("Utilisateur mis à jour");
      } else {
        // Mot de passe auto-généré côté serveur si absent (UserController::
        // create) — connexion via Google par défaut, cf. retour Ethibaud.
        await api.post("create_user", values);
        toast.success("Utilisateur crée");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEdit) return;
    const name = `${values.first_name} ${values.last_name}`;
    if (!confirm(`Supprimer l'utilisateur « ${name} » ?`)) return;
    try {
      await api.del("delete_user", { id: userId });
      toast.success("Utilisateur supprimé");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modifier l'utilisateur" : "Nouvel utilisateur"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Mettre à jour les informations du compte."
              : "Créer un nouveau compte utilisateur."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Chargement…
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">Prénom</Label>
                <Input
                  id="first_name"
                  value={values.first_name}
                  required
                  onChange={(e) => set("first_name", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Nom</Label>
                <Input
                  id="last_name"
                  value={values.last_name}
                  required
                  onChange={(e) => set("last_name", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={values.email}
                required
                onChange={(e) => set("email", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hire_date">Date d'embauche</Label>
                <Input
                  id="hire_date"
                  type="date"
                  value={values.hire_date}
                  onChange={(e) => set("hire_date", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email_perso">Email perso</Label>
                <Input
                  id="email_perso"
                  value={values.email_perso}
                  onChange={(e) => set("email_perso", e.target.value)}
                />
              </div>
            </div>

            {isEdit && (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="password">Réinitialiser le mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min. 8 caracteres — rarement utile, connexion via Google par défaut"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!password || passwordSaving}
                  onClick={handleSetPassword}
                >
                  {passwordSaving ? "…" : "Definir"}
                </Button>
              </div>
            )}

            <div className="flex gap-6 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values.is_codir === 1}
                  onCheckedChange={(c) => set("is_codir", c ? 1 : 0)}
                />
                Codir
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values.active === 1}
                  onCheckedChange={(c) => set("active", c ? 1 : 0)}
                />
                Actif
              </label>
            </div>

            {/* Accès applicatifs : par application, un profil (raccourci qui coche un ensemble de permissions) puis les permissions elles-mêmes */}
            {isEdit && apps.some((a) => a.roles.length > 0 || a.permissions.length > 0) && (
              <div className="space-y-2 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Accès applicatifs</p>
                  <p className="text-muted-foreground text-xs">
                    Ce qui compte, ce sont les permissions cochées. Un profil est un
                    raccourci : il coche d'un coup un ensemble de permissions, mais on
                    peut aussi cocher les permissions une à une, sans profil.
                  </p>
                </div>
                {apps
                  .filter((app) => app.roles.length > 0 || app.permissions.length > 0)
                  .map((app) => {
                    const userRoles = rolesByApp[app.id] || [];
                    const assignedRoleIds = new Set(userRoles.map((r) => r.app_role_id));
                    const availableRoles = app.roles.filter((r) => !assignedRoleIds.has(r.id));
                    const busy = roleAction?.appId === app.id && roleAction?.type === "assign";
                    const groups = new Map<string, AdminPermission[]>();
                    for (const p of app.permissions) {
                      const key = p.group?.trim() || "Autres";
                      if (!groups.has(key)) groups.set(key, []);
                      groups.get(key)!.push(p);
                    }
                    return (
                      <div key={app.id} className="space-y-2 rounded border p-2">
                        <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                          {app.name}
                        </p>

                        {app.roles.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-muted-foreground text-xs">Profil</span>
                            {userRoles.length === 0 && (
                              <span className="text-muted-foreground text-xs italic">aucun</span>
                            )}
                            {userRoles.map((r) => (
                              <Badge key={r.id} variant="secondary" className="gap-0.5 pr-0.5">
                                {r.role_label}
                                <button
                                  type="button"
                                  className="hover:text-red-600 ml-0.5"
                                  onClick={() => revokeRole(r.id)}
                                  disabled={roleAction?.assignmentId === r.id}
                                >
                                  {roleAction?.assignmentId === r.id ? "…" : <X className="size-3" />}
                                </button>
                              </Badge>
                            ))}
                            {availableRoles.length > 0 && (
                              <Select disabled={busy} onValueChange={(v) => assignRole(app.id, Number(v))}>
                                <SelectTrigger className="h-7 w-auto gap-1 text-xs">
                                  <SelectValue placeholder={busy ? "…" : "+ Appliquer un profil"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableRoles.map((r) => (
                                    <SelectItem key={r.id} value={String(r.id)}>
                                      {r.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        )}

                        <div className="space-y-2">
                          {[...groups.entries()].map(([groupTitle, groupPerms]) => (
                            <div key={groupTitle} className="rounded bg-muted/30 p-2">
                              <p className="mb-1.5 text-xs font-medium">{groupTitle}</p>
                              <div className="space-y-1.5">
                                {groupPerms.map((p) => {
                                  const key = `${app.id}:${p.name}`;
                                  const viaRole = roleGrantsPermission(app.id, p.name);
                                  const denied = isDenied(app.id, p.name);
                                  const effective = !denied && (viaRole || hasGrant(app.id, p.name));
                                  return (
                                    <label key={p.id} className="flex items-center gap-2 text-sm">
                                      <Checkbox
                                        checked={effective}
                                        disabled={permSaving === key}
                                        onCheckedChange={() => togglePerm(app.id, p, viaRole)}
                                      />
                                      {permSaving === key ? "…" : p.label}
                                      {!!p.default_on && (
                                        <Badge variant="secondary" className="px-1 py-0 text-[10px] font-normal">
                                          par défaut
                                        </Badge>
                                      )}
                                      {viaRole && !denied && (
                                        <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal">
                                          via profil
                                        </Badge>
                                      )}
                                      {denied && (
                                        <Badge variant="destructive" className="px-1 py-0 text-[10px] font-normal">
                                          refusé{viaRole ? " (bloque le profil)" : ""}
                                        </Badge>
                                      )}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {isEdit && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">
                  Assignations{" "}
                  <span className="text-muted-foreground font-normal">
                    ({assignments.length})
                  </span>
                </p>
                {assignments.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Aucune assignation active.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {assignments.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span>{a.node_name}</span>
                        <span className="text-muted-foreground text-xs">
                          ({a.node_type})
                        </span>
                        {a.is_primary === 1 && (
                          <Badge variant="secondary">Principal</Badge>
                        )}
                        {a.is_node_manager === 1 && (
                          <span title="Responsable de nœud (OKR)">👑</span>
                        )}
                        <Select
                          value={a.grade_id ? String(a.grade_id) : NO_GRADE}
                          disabled={gradeSaving === a.id}
                          onValueChange={(v) => updateAssignmentGrade(a.id, v)}
                        >
                          <SelectTrigger className="ml-auto h-7 w-36 text-xs">
                            <SelectValue placeholder="— Grade —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_GRADE}>— Aucun —</SelectItem>
                            {grades.map((g) => (
                              <SelectItem key={g.id} value={String(g.id)}>
                                {g.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <DialogFooter>
              {isEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={handleDelete}
                >
                  <Trash2 className="size-3.5" /> Supprimer
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "…" : isEdit ? "Enregistrer" : "Créer"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
