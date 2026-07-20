import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppWindow } from "lucide-react";
import { api } from "@/lib/api";
import type { AppListItem } from "./types";
import { AppArchitectureChart } from "./AppArchitectureChart";

export function ArchitecturePage() {
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadApps = useCallback(async () => {
    try {
      setApps(await api.get<AppListItem[]>("apps"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  return (
    <div className="h-full">
      {!loaded ? null : apps.length === 0 ? (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
          <AppWindow className="size-10 opacity-30" />
          <p>Aucune application</p>
        </div>
      ) : (
        <div className="h-full">
          <AppArchitectureChart apps={apps} onChanged={loadApps} />
        </div>
      )}
    </div>
  );
}
