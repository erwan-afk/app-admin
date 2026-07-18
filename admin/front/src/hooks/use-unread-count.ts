import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const POLL_INTERVAL = 30_000;

/**
 * Compte de notifications non lues, par polling (~30s) via le proxy admin
 * (`?action=unread_count` → GoalsController Doctrine). Le polling est suspendu
 * quand l'onglet n'est pas visible (économie de requêtes) et relancé au retour.
 *
 * Historique : le compteur était poussé en SSE (EventSource vers
 * admin/api/index.php?action=notifications_stream). Le SSE a été retiré au
 * profit du polling lors de la suppression du legacy (le routeur serveur n'est
 * pas fait pour des connexions longue durée, et un stream mobilisait un thread
 * FrankenPHP). Latence du badge ~30s, négligeable pour un compteur.
 */
export function useUnreadCount(): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let pollId: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      try {
        const data = await api.get<{ count?: number }>("unread_count");
        setUnread(data.count ?? 0);
      } catch {
        // Erreur transitoire : on réessaiera au prochain tick. Un 401 déclenche
        // déjà la redirection login via le handler global de `api`.
      }
    };

    const start = () => {
      if (pollId) return;
      poll();
      pollId = setInterval(poll, POLL_INTERVAL);
    };

    const stop = () => {
      clearInterval(pollId);
      pollId = undefined;
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return unread;
}
