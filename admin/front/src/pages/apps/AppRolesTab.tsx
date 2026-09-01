import { useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { AppDetail, AppPermission, RoleWithPermissions } from "./types";

interface Props {
  app: AppDetail;
  perms: AppPermission[];
  onChanged: () => void;
}

function groupPerms(perms: AppPermission[]): Map<string, AppPermission[]> {
  const groups = new Map<string, AppPermission[]>();
  for (const p of perms) {
    const key = p.group?.trim() || "Autres";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return groups;
}

function PermGroupBlock({
  title,
  perms,
  checked,
  onTogglePerm,
  onToggleGroup,
}: {
  title: string;
  perms: AppPermission[];
  checked: Set<number>;
  onTogglePerm: (id: number, on: boolean) => void;
  onToggleGroup: (perms: AppPermission[], on: boolean) => void;
}) {
  const checkedCount = perms.filter((p) => checked.has(p.id)).length;
  const groupState: boolean | "indeterminate" =
    checkedCount === 0 ? false : checkedCount === perms.length ? true : "indeterminate";

  return (
    <div className="rounded border">
      <label className="bg-muted/40 flex items-center gap-2 border-b px-2 py-1.5 text-sm font-medium">
        <Checkbox
          checked={groupState}
          onCheckedChange={(c) => onToggleGroup(perms, !!c)}
        />
        {title}
        <span className="text-muted-foreground ml-auto text-xs font-normal">
          {checkedCount}/{perms.length}
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2 p-2">
        {perms.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={checked.has(p.id)}
              onCheckedChange={(c) => onTogglePerm(p.id, !!c)}
            />
            <span>{p.label}</span>
            {!!p.default_on && (
              <Badge variant="secondary" className="px-1 py-0 text-[10px] font-normal">
                par défaut
              </Badge>
            )}
            <span className="text-muted-foreground font-mono text-xs">{p.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function AppRolesTab({ app, perms, onChanged }: Props) {
  const [openRole, setOpenRole] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [initial, setInitial] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("");

  async function toggleRole(roleId: number) {
    if (openRole === roleId) {
      setOpenRole(null);
      return;
    }
    setOpenRole(roleId);
    try {
      const role = await api.get<RoleWithPermissions>(`role&id=${roleId}&app_id=${app.id}`);
      const ids = new Set(role.permissions.map((p) => p.id));
      setChecked(new Set(ids));
      setInitial(new Set(ids));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  function togglePerm(permId: number, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(permId);
      else next.delete(permId);
      return next;
    });
  }

  function toggleGroup(groupPerms: AppPermission[], on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const p of groupPerms) {
        if (on) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  }

  async function savePerms(roleId: number) {
    const toAttach = [...checked].filter((id) => !initial.has(id));
    const toDetach = [...initial].filter((id) => !checked.has(id));
    try {
      await Promise.all([
        ...toAttach.map((permission_id) =>
          api.post("attach_permission", { app_id: app.id, role_id: roleId, permission_id }),
        ),
        ...toDetach.map((permission_id) =>
          api.del("detach_permission", { app_id: app.id, role_id: roleId, permission_id }),
        ),
      ]);
      setInitial(new Set(checked));
      toast.success("Permissions mises à jour");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    }
  }

  function startEdit(e: React.MouseEvent, r: AppDetail["roles"][number]) {
    e.stopPropagation();
    setEditing(r.id);
    setEditName(r.name);
    setEditLabel(r.label);
  }

  async function saveEdit(roleId: number) {
    if (!editName.trim() || !editLabel.trim()) {
      toast.error("Nom et label requis");
      return;
    }
    try {
      await api.put("update_role", { app_id: app.id, id: roleId, name: editName, label: editLabel });
      toast.success("Rôle mis à jour");
      setEditing(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function removeRole(e: React.MouseEvent, roleId: number, label: string) {
    e.stopPropagation();
    if (!confirm(`Supprimer le rôle « ${label} » ?`)) return;
    try {
      await api.del("delete_role", { app_id: app.id, id: roleId });
      toast.success("Rôle supprimé");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function createRole(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("create_role", { app_id: app.id, name: newName, label: newLabel });
      toast.success("Rôle créé");
      setNewName("");
      setNewLabel("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="max-w-3xl space-y-2">
      {app.roles.length === 0 && (
        <p className="text-muted-foreground text-sm">Aucun rôle défini pour cette application.</p>
      )}

      {app.roles.map((r) => (
        <div key={r.id} className="rounded-md border">
          <div
            className="flex cursor-pointer items-center gap-2 px-3 py-2"
            onClick={() => editing !== r.id && toggleRole(r.id)}
          >
            {editing === r.id ? (
              <>
                <Input
                  className="h-7 w-32 font-mono text-xs"
                  value={editName}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <Input
                  className="h-7 flex-1 text-xs"
                  value={editLabel}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditLabel(e.target.value)}
                />
                <Button size="icon" className="size-7" onClick={(e) => { e.stopPropagation(); saveEdit(r.id); }}>
                  <Check className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={(e) => { e.stopPropagation(); setEditing(null); }}>
                  <X className="size-3.5" />
                </Button>
              </>
            ) : (
              <>
                <ChevronRight className={cn("size-4 transition-transform", openRole === r.id && "rotate-90")} />
                <Badge variant="outline" className="font-mono">{r.name}</Badge>
                <span className="text-sm">{r.label}</span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {r.permission_count} permission(s)
                </span>
                <Button variant="ghost" size="icon" className="size-7" onClick={(e) => startEdit(e, r)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7 text-red-600" onClick={(e) => removeRole(e, r.id, r.label || r.name)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>

          {openRole === r.id && (
            <div className="border-t p-3">
              {perms.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Aucune permission définie. Créez-en dans l'onglet « Permissions ».
                </p>
              ) : (
                <>
                  <p className="text-muted-foreground mb-2 text-xs">
                    Cochez les permissions accordées par ce rôle :
                  </p>
                  <div className="space-y-2">
                    {(() => {
                      const groups = groupPerms(perms);
                      return (
                        <>
                          {[...groups.entries()].map(([title, groupPermsList]) => (
                            <PermGroupBlock
                              key={title}
                              title={title}
                              perms={groupPermsList}
                              checked={checked}
                              onTogglePerm={togglePerm}
                              onToggleGroup={toggleGroup}
                            />
                          ))}
                        </>
                      );
                    })()}
                  </div>
                  <Button size="sm" className="mt-3" onClick={() => savePerms(r.id)}>
                    Enregistrer les permissions
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      <form onSubmit={createRole} className="flex flex-wrap items-end gap-2 border-t pt-4">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium">Nom (slug)</label>
          <Input required pattern="[a-z0-9_-]+" placeholder="ex: admin" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium">Label</label>
          <Input required placeholder="ex: Administrateur" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        </div>
        <Button type="submit">+ Ajouter un rôle</Button>
      </form>
    </div>
  );
}
