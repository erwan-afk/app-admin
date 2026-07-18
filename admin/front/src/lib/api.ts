// Point d'entrée unique vers l'API admin (proxy HTTP → server/, ADR-010 Lot 4).
// En dev (Vite :5174) les appels /admin/proxy.php sont relayés vers :8003
// par le proxy (voir vite.config.ts). En prod le build est servi par PHP
// sous /admin/front/dist/, donc le chemin absolu /admin/proxy.php fonctionne.
//
// Le proxy.php forwarde les appels vers server/ (SSO_SERVER) en utilisant
// le Bearer JWT du cookie de session admin — plus aucun PDO direct dans
// admin/api/. Les actions non encore migrées retombent sur l'API legacy.
const API_BASE = "/admin/proxy.php";

/** Erreur API portant le code HTTP, pour distinguer 401 / 403 / autres.
 *  Hérite d'Error → les `catch (e instanceof Error)` existants restent valides. */
export class ApiError extends Error {
  status: number;
  /** Présent sur un 403 « scopé structure » (ADR-008) : URL de l'app structure
   *  vers laquelle la SPA doit basculer automatiquement (cf. AuthContext). */
  redirectUrl?: string | null;
  constructor(status: number, message: string, redirectUrl?: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.redirectUrl = redirectUrl;
  }
}

// Handler global déclenché sur un 401 (token absent/expiré). Enregistré par
// l'AuthProvider pour rediriger vers le login — couvre l'expiration de session
// sur N'IMPORTE quel appel API, pas seulement au démarrage.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function request<T>(action: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}?action=${action}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    const body = data as { error?: string; redirect_url?: string | null };
    throw new ApiError(res.status, body.error || `Erreur ${res.status}`, body.redirect_url);
  }
  return data as T;
}

export const api = {
  get: <T>(action: string) => request<T>(action),
  post: <T>(action: string, body: unknown) =>
    request<T>(action, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(action: string, body: unknown) =>
    request<T>(action, { method: "PUT", body: JSON.stringify(body) }),
  del: <T>(action: string, body: unknown) =>
    request<T>(action, { method: "DELETE", body: JSON.stringify(body) }),
};
