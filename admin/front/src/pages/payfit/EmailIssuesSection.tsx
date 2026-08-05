import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MailWarning, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { UserRow } from "../users/types";

/**
 * Adresses professionnelles qui ne correspondent à aucune boîte réelle, et
 * correction sur place.
 *
 * Deux provenances posent problème (`users.email_source`, migration 051
 * d'auth_global) :
 *   - `placeholder` : Payfit n'a aucun email professionnel pour cette personne,
 *     la synchro a posé une adresse technique `@non-renseigne.invalid` ;
 *   - `derived` : l'adresse a été INVENTÉE par l'ancienne règle de synchro
 *     (initiale + nom translittéré), retirée le 2026-08-05.
 *
 * Dans les deux cas la conséquence est la même et elle était invisible : la
 * personne ne reçoit rien, ne peut pas se connecter, et son chiffre d'affaires
 * ne peut pas être rapproché de `report` puisque la jointure se fait sur
 * l'email. Trois adresses inventées cachaient 49 130 € de CA sur juillet 2026.
 *
 * Volontairement PAS de suggestion d'adresse pré-remplie : c'est précisément une
 * suggestion automatique (« initiale + nom ») qui a créé le problème. La vraie
 * boîte ne se devine pas.
 */
export function EmailIssuesSection() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.get<UserRow[]>("users"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const problemes = useMemo(
    () =>
      users.filter(
        (u) => u.active === 1 && (u.email_source === "derived" || u.email_source === "placeholder"),
      ),
    [users],
  );

  // Comptes désactivés dans le même état : signalés en une ligne, sans occuper
  // la liste — leur adresse n'a plus d'effet sur le rapprochement du CA.
  const inactifs = useMemo(
    () =>
      users.filter(
        (u) => u.active !== 1 && (u.email_source === "derived" || u.email_source === "placeholder"),
      ).length,
    [users],
  );

  async function handleSave(u: UserRow) {
    const email = (drafts[u.id] ?? "").trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error("Adresse invalide");
      return;
    }
    if (email === u.email.toLowerCase()) {
      toast.error("C'est déjà l'adresse enregistrée");
      return;
    }
    setSaving(u.id);
    try {
      // Le serveur pose `email_source = 'manual'` dès que l'adresse change
      // (UserController::update) : la synchro Payfit ne l'écrasera plus jamais.
      await api.put("update_user", { id: u.id, email });
      toast.success(`${u.first_name} ${u.last_name} : adresse corrigée`);
      setDrafts((d) => {
        const next = { ...d };
        delete next[u.id];
        return next;
      });
      load();
    } catch (e) {
      // Cas le plus probable : l'adresse est déjà portée par un autre compte
      // (doublon) — le message du serveur le dit, on le laisse passer tel quel.
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground py-4 text-center text-sm">Vérification des adresses…</p>;
  }

  if (problemes.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        Aucune adresse professionnelle à corriger.
        {inactifs > 0 && ` (${inactifs} compte(s) désactivé(s) concerné(s), sans effet.)`}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="border-bad/40">
        <CardContent className="p-4 text-xs">
          <p className="flex items-center gap-1.5 font-medium">
            <MailWarning className="size-4 text-bad" />
            {problemes.length} adresse(s) professionnelle(s) inutilisable(s)
          </p>
          <p className="text-muted-foreground mt-1.5">
            Ces personnes ne reçoivent aucun courrier, ne peuvent pas se connecter, et leur
            chiffre d'affaires n'est pas rapproché de <span className="font-mono">report</span> —
            le rapprochement se fait sur l'email.
          </p>
          <p className="text-muted-foreground mt-1.5">
            <span className="font-medium">Le mieux est de renseigner l'email professionnel dans
            Payfit</span>, puis de resynchroniser ci-dessus : Payfit reste la source de vérité et
            la correction se propage. Corriger ici marque l'adresse comme{" "}
            <span className="font-mono">saisie manuelle</span>, ce qui la protège d'une resynchro
            mais fait aussi que Payfit ne la mettra plus jamais à jour.
          </p>
        </CardContent>
      </Card>

      {problemes.map((u) => (
        <Card key={u.id}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">
                    {u.first_name} {u.last_name}
                  </span>
                  {u.email_source === "placeholder" ? (
                    <Badge variant="destructive">email pro manquant</Badge>
                  ) : (
                    <Badge variant="destructive">adresse inventée</Badge>
                  )}
                  {u.team_name && <Badge variant="outline">{u.team_name}</Badge>}
                </div>
                <p className="text-muted-foreground mt-0.5 font-mono text-xs break-all">
                  {u.email}
                </p>
              </div>
              {/* Pas de lien vers la fiche : il n'existe pas de route
                  /users/:id, la fiche s'ouvre en maître-détail dans la page
                  Utilisateurs. La correction se fait ici de toute façon. */}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                value={drafts[u.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [u.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave(u);
                }}
                placeholder="vraie adresse professionnelle"
                className="h-8 max-w-xs flex-1 text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                size="sm"
                disabled={saving === u.id || !(drafts[u.id] ?? "").trim()}
                onClick={() => handleSave(u)}
              >
                <Check className="size-3.5" />
                {saving === u.id ? "Enregistrement…" : "Corriger"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {inactifs > 0 && (
        <p className="text-muted-foreground text-xs">
          {inactifs} compte(s) désactivé(s) sont dans le même état — sans effet sur le
          rapprochement du CA, non listés.
        </p>
      )}
    </div>
  );
}
