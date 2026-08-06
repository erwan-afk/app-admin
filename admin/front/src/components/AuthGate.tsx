import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { loginUrl } from "@/lib/auth";

/** Conteneur centré pour les écrans pleine page (loading / accès refusé / erreur). */
function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo className="h-7 w-auto" />
      {children}
    </div>
  );
}

/**
 * Garde au montage de la SPA. Tant qu'on ne sait pas si l'utilisateur est
 * autorisé (loading), ou s'il ne l'est pas, on n'affiche jamais le layout.
 *  - 401 → redirection automatique vers le login OAuth (pas d'écran brandé).
 *  - 403 → écran « accès refusé » + déconnexion (pas de redirection : boucle).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, email, redirectUrl, logout, retry } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = loginUrl();
    } else if (status === "redirect" && redirectUrl) {
      window.location.href = redirectUrl;
    }
  }, [status, redirectUrl]);

  if (status === "authenticated") return <>{children}</>;

  if (status === "redirect") {
    return (
      <Screen>
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
        <p className="text-muted-foreground max-w-sm text-sm">
          La console admin est réservée à l'administration du groupe —
          redirection vers Atlas…
        </p>
      </Screen>
    );
  }

  if (status === "forbidden") {
    return (
      <Screen>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">Accès refusé</h1>
          <p className="text-muted-foreground max-w-sm text-sm">
            {email ? <>Le compte <strong>{email}</strong> n'a pas</> : "Ce compte n'a pas"} accès à
            la console admin (permission <code>admin_access</code> ou <code>goals_access</code>{" "}
            requise).
          </p>
        </div>
        <Button variant="outline" onClick={logout}>
          Se déconnecter / changer de compte
        </Button>
      </Screen>
    );
  }

  if (status === "error") {
    return (
      <Screen>
        <p className="text-muted-foreground max-w-sm text-sm">
          Impossible de vérifier la session. Le serveur d'authentification est peut-être
          indisponible.
        </p>
        <Button variant="outline" onClick={retry}>
          Réessayer
        </Button>
      </Screen>
    );
  }

  // loading + unauthenticated (le temps que la redirection parte)
  return (
    <Screen>
      <Loader2 className="text-muted-foreground size-5 animate-spin" />
      <p className="text-muted-foreground text-sm">
        {status === "unauthenticated" ? "Redirection vers la connexion…" : "Chargement…"}
      </p>
    </Screen>
  );
}
