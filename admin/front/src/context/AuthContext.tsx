import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, setUnauthorizedHandler } from "@/lib/api";
import { loginUrl, logoutUrl, type CurrentUser } from "@/lib/auth";

type Status = "loading" | "authenticated" | "unauthenticated" | "forbidden" | "redirect" | "error";

interface AuthState {
  status: Status;
  user: CurrentUser | null;
  /** Email connu même en cas de 403 (compte sans admin_access ni goals_access). */
  email: string | null;
  /** Présent si status === "redirect" : URL de l'app structure (ADR-008). */
  redirectUrl: string | null;
  logout: () => void;
  retry: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const me = await api.get<CurrentUser>("me");
      setUser(me);
      setEmail(me.email ?? null);
      setStatus("authenticated");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setStatus("unauthenticated");
      } else if (e instanceof ApiError && e.status === 403 && e.redirectUrl) {
        // ADR-008 : acteur scopé structure — bascule vers son app dédiée.
        setRedirectUrl(e.redirectUrl);
        setStatus("redirect");
      } else if (e instanceof ApiError && e.status === 403) {
        setStatus("forbidden");
      } else {
        setStatus("error");
      }
    }
  }

  useEffect(() => {
    // Redirige vers le login dès qu'un appel API renvoie 401 (token expiré).
    setUnauthorizedHandler(() => {
      window.location.href = loginUrl();
    });
    load();
    return () => setUnauthorizedHandler(null);
  }, []);

  const logout = () => {
    window.location.href = logoutUrl();
  };

  return (
    <AuthContext.Provider value={{ status, user, email, redirectUrl, logout, retry: load }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
