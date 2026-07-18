import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import type { AppDetail, AppPermission } from "./types";

interface Props {
  app: AppDetail;
  perms: AppPermission[];
  onChanged: () => void;
}

export function AppPermsTab({ app, perms, onChanged }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("");

  function startEdit(p: AppPermission) {
    setEditing(p.id);
    setEditName(p.name);
    setEditLabel(p.label);
  }

  async function saveEdit(id: number) {
    if (!editName.trim() || !editLabel.trim()) {
      toast.error("Nom et label requis");
      return;
    }
    try {
      await api.put("update_permission", { app_id: app.id, id, name: editName, label: editLabel });
      toast.success("Permission mise à jour");
      setEditing(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function remove(p: AppPermission) {
    if (!confirm(`Supprimer la permission « ${p.label} » ?`)) return;
    try {
      await api.del("delete_permission", { app_id: app.id, id: p.id });
      toast.success("Permission supprimée");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("create_permission", { app_id: app.id, name: newName, label: newLabel });
      toast.success("Permission créée");
      setNewName("");
      setNewLabel("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom (slug)</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Utilisé dans</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {perms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground py-6 text-center">
                  Aucune permission définie.
                </TableCell>
              </TableRow>
            ) : (
              perms.map((p) =>
                editing === p.id ? (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Input className="h-7 font-mono text-xs" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-7 text-xs" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                    </TableCell>
                    <TableCell>—</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" className="size-7" onClick={() => saveEdit(p.id)}>
                          <Check className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(null)}>
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={p.id}>
                    <TableCell><code className="text-xs">{p.name}</code></TableCell>
                    <TableCell>{p.label}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{p.role_count} rôle(s)</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => startEdit(p)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7 text-red-600" onClick={() => remove(p)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ),
              )
            )}
          </TableBody>
        </Table>
      </div>

      <form onSubmit={create} className="flex flex-wrap items-end gap-2 border-t pt-4">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium">Nom (slug)</label>
          <Input required pattern="[a-z0-9_.-]+" placeholder="ex: can_export" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium">Label</label>
          <Input required placeholder="ex: Exporter les données" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        </div>
        <Button type="submit">+ Ajouter une permission</Button>
      </form>
    </div>
  );
}
