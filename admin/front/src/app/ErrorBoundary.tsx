import { isRouteErrorResponse, useRouteError, useNavigate } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

/** Écran d'erreur de route (errorElement) — remplace le fallback par défaut
 *  de react-router ("Hey developer 👋"), destiné aux devs et jamais montrable
 *  à un vrai utilisateur. Même conteneur centré que AuthGate::Screen. */
export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Erreur inconnue";

  return (
    <div className="bg-background flex h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo className="h-7 w-auto" />
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold">Une erreur est survenue</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          Quelque chose s'est mal passé en affichant cette page. L'équipe technique a été
          notifiée.
        </p>
        {import.meta.env.DEV && (
          <p className="text-muted-foreground max-w-md font-mono text-xs break-words">
            {message}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate(0)}>
          Recharger la page
        </Button>
        <Button onClick={() => navigate("/")}>Retour à l'accueil</Button>
      </div>
    </div>
  );
}
