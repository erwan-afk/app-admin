import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { api } from "@/lib/api";
import type { PayfitCompany, PayfitCompanyFormValues } from "./types";

const EMPTY: PayfitCompanyFormValues = { label: "", api_key: "", company_id: "", email_domain: "" };

interface Props {
  /** company à éditer, null pour créer, undefined = fermé */
  company: PayfitCompany | null | undefined;
  onClose: () => void;
  onSaved: () => void;
}

export function PayfitCompanyDialog({ company, onClose, onSaved }: Props) {
  const open = company !== undefined;
  const isEdit = !!company;

  const [values, setValues] = useState<PayfitCompanyFormValues>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(
      company
        ? {
            label: company.label,
            api_key: "",
            company_id: company.company_id ?? "",
            email_domain: company.email_domain,
          }
        : EMPTY,
    );
  }, [open, company]);

  const set = (k: keyof PayfitCompanyFormValues, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit && company) {
        await api.put("update_payfit_company", { ...values, id: company.id });
        toast.success("Configuration mise à jour");
      } else {
        await api.post("create_payfit_company", values);
        toast.success("Configuration créée");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier la configuration" : "Nouvelle entreprise Payfit"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Mettre à jour la clé API ou les paramètres de synchronisation."
              : "Ajouter une entreprise Payfit (clé API dédiée) pour synchroniser ses collaborateurs."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="label">Nom</Label>
            <Input
              id="label"
              placeholder="ex. Media-Start"
              value={values.label}
              required
              onChange={(e) => set("label", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="api_key">Clé API Payfit</Label>
            <Input
              id="api_key"
              type="password"
              placeholder={isEdit ? "Laisser vide pour ne pas changer" : "Clé privée (Bearer)"}
              value={values.api_key}
              required={!isEdit}
              onChange={(e) => set("api_key", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email_domain">Domaine email pro</Label>
            <Input
              id="email_domain"
              placeholder="ex. media-start.fr"
              value={values.email_domain}
              required
              onChange={(e) => set("email_domain", e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Sert à dériver l'email de connexion quand Payfit n'a que l'email perso.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="company_id">Company ID Payfit (optionnel)</Label>
            <Input
              id="company_id"
              placeholder="résolu automatiquement si vide"
              value={values.company_id}
              onChange={(e) => set("company_id", e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "…" : isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
