import { Construction } from "lucide-react";

/** Section pas encore migrée vers React — l'écran vanilla reste dispo sur /admin/. */
export function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Construction className="text-muted-foreground/40 size-10" />
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground text-sm">
          Section en cours de migration. Disponible sur l'admin actuel (<code>/admin/</code>).
        </p>
      </div>
    </div>
  );
}
