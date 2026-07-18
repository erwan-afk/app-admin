import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import type { UserRow } from "./types";
import { UserFormDialog } from "./UserFormDialog";

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  // undefined = fermé · null = création · number = édition
  const [editing, setEditing] = useState<number | null | undefined>(undefined);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    try {
      const action = term
        ? `users&search=${encodeURIComponent(term)}`
        : "users";
      setUsers(await api.get<UserRow[]>(action));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  // Recherche debouncée
  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  const activeCount = users.filter((u) => u.active === 1).length;

  async function remove(id: number, name: string) {
    if (!confirm(`Supprimer l'utilisateur « ${name} » ?`)) return;
    try {
      await api.del("delete_user", { id });
      toast.success("Utilisateur supprimé");
      load(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Utilisateurs</h1>
          {!loading && (
            <p className="text-muted-foreground text-sm">
              <strong>{users.length}</strong> utilisateurs · {activeCount}{" "}
              actifs · {users.length - activeCount} inactifs
            </p>
          )}
        </div>
        <Button onClick={() => setEditing(null)}>+ Nouvel utilisateur</Button>
      </div>

      <Input
        placeholder="Rechercher (nom, email)…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-xs"
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center"
                >
                  Chargement…
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center"
                >
                  Aucun utilisateur trouvé
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <button
                      className="text-primary font-medium hover:underline"
                      onClick={() => setEditing(u.id)}
                    >
                      {u.first_name} {u.last_name}
                    </button>
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.grade || "—"}</TableCell>
                  <TableCell>
                    {u.active === 1 ? (
                      <Badge variant="secondary">Actif</Badge>
                    ) : (
                      <Badge variant="outline">Inactif</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(u.id)}
                      >
                        Modifier
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-red-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() =>
                          remove(u.id, `${u.first_name} ${u.last_name}`)
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <UserFormDialog
        userId={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => load(search)}
      />
    </div>
  );
}
